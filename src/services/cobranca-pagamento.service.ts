import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPayoutQueue } from "../queues/payout.queue.js";
import { CobrancaStatus, ConfigKey, PixKeyStatus, RepasseStatus, TransactionStatus } from "../types/enums.js";
import { getConfigNumber } from "./configuracao.service.js";

interface PagamentoInfo {
    horario?: string | Date;
    [key: string]: any;
}

export const cobrancaPagamentoService = {
  
  async processarPagamento(txid: string, valor: number, pagamento: PagamentoInfo, reciboUrl?: string): Promise<boolean> {
       // Buscar Cobrança pelo TXID
       const { data: cobranca } = await supabaseAdmin.from("cobrancas").select("id, status").eq("txid_pix", txid).single();
       if (!cobranca) throw new Error("Cobrança não encontrada pelo TXID");

        const { error } = await supabaseAdmin
            .from("cobrancas")
            .update({
                status: CobrancaStatus.PAGO,
                valor_pago: valor,
                data_pagamento: pagamento.horario || new Date(),
                dados_auditoria_pagamento: pagamento,
                recibo_url: reciboUrl
            })
            .eq("id", cobranca.id);
            
        if (error) throw error;
        
        logger.info({ cobrancaId: cobranca.id, txid }, "Pagamento processado e registrado com sucesso.");
        return true;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    // 1. Buscar a cobrança para validar se é pagamento manual
    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("cobrancas")
      .select("id, pagamento_manual, status, status_repasse")
      .eq("id", cobrancaId)
      .single();

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    // 2. Validar se é pagamento manual e se já foi repassado
    if (!cobranca.pagamento_manual) {
      throw new AppError("Apenas pagamentos manuais podem ser desfeitos.", 400);
    }

    if (cobranca.status_repasse === RepasseStatus.REPASSADO) {
        throw new AppError("Não é possível desfazer: O valor já foi repassado ao motorista.", 400);
    }

    // 3. Executar o desfazer
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({
        status: CobrancaStatus.PENDENTE,
        data_pagamento: null,
        valor_pago: null,
        tipo_pagamento: null,
        pagamento_manual: false, // Resetar
        recibo_url: null,
        dados_auditoria_pagamento: null,
        status_repasse: RepasseStatus.PENDENTE
      })
      .eq("id", cobrancaId)
      .select()
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    // Repasse resetado para PENDENTE acima.

    return data;
  },

  async iniciarRepasse(cobrancaId: string): Promise<any> {
      logger.info({ cobrancaId }, "Iniciando fluxo de repasse (Queue)...");

      // 1. Buscar Cobrança
      const { data: cobranca } = await supabaseAdmin.from("cobrancas").select("id, usuario_id, valor, status_repasse").eq("id", cobrancaId).single();
      
      if (!cobranca) throw new AppError("Cobrança não encontrada para repasse.", 404);
      if (cobranca.status_repasse === RepasseStatus.REPASSADO) {
          logger.warn({ cobrancaId }, "Repasse já realizado.");
          return { success: true, alreadyDone: true };
      }

      // 2. Buscar Motorista e Validar Chave PIX
      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("id, chave_pix, status_chave_pix")
        .eq("id", cobranca.usuario_id)
        .single();

      const hasValidPix = usuario?.chave_pix && usuario?.status_chave_pix === PixKeyStatus.VALIDADA;

      // 3. Calcular Valor do Repasse (Taxa PIX)
      const taxa = await getConfigNumber(ConfigKey.TAXA_INTERMEDIACAO_PIX, 0.99); 
      const valorRepasse = cobranca.valor - taxa; 

      if (valorRepasse <= 0) {
           logger.warn({ cobrancaId, valor: cobranca.valor, taxa }, "Valor do repasse zerado ou negativo.");
           return { success: false, reason: "valor_baixo" };
      }

      // 4. Registrar Transação no Banco (Pendente ou Falha por Chave)
      const transacaoData: any = {
          cobranca_id: cobrancaId,
          usuario_id: cobranca.usuario_id,
          valor_bruto: cobranca.valor,
          taxa_plataforma: taxa,
          valor_liquido: valorRepasse,
          status: hasValidPix ? TransactionStatus.PROCESSAMENTO : RepasseStatus.FALHA, 
          data_execucao: new Date()
      };

      if (!hasValidPix) {
          transacaoData.mensagem_erro = !usuario?.chave_pix 
            ? "Chave PIX não cadastrada" 
            : "Chave PIX aguardando validação ou inválida";
      }

      const { data: transacao, error: txError } = await supabaseAdmin
        .from("transacoes_repasse")
        .insert(transacaoData)
        .select()
        .single();
      
      if (txError) {
          logger.error({ txError }, "Erro ao criar registro de transação de repasse");
      }

      // 5. Se não tiver PIX válido, abortar repasse automático (avisar motorista no dashboard via status)
      if (!hasValidPix) {
          logger.warn({ cobrancaId, motoristaId: cobranca.usuario_id }, "Repasse abortado: Chave PIX inválida ou ausente");
          await supabaseAdmin.from("cobrancas").update({ 
              status_repasse: RepasseStatus.FALHA,
              id_transacao_repasse: transacao?.id 
          }).eq("id", cobrancaId);
          return { success: false, reason: "pix_invalido", transacaoId: transacao?.id };
      }

      // 6. Jogar na FILA (PayoutQueue)
      try {
          await addToPayoutQueue({
              cobrancaId,
              motoristaId: cobranca.usuario_id,
              valorRepasse,
              transacaoId: transacao?.id
          });
          
          // Atualizar status da cobrança e vincular transação
          await supabaseAdmin.from("cobrancas").update({ 
              status_repasse: RepasseStatus.PENDENTE,
              id_transacao_repasse: transacao?.id
          }).eq("id", cobrancaId);

          return { success: true, queued: true, transacaoId: transacao?.id };

      } catch (queueError) {
           logger.error({ queueError }, "Erro ao enfileirar repasse");
           await supabaseAdmin.from("cobrancas").update({ status_repasse: RepasseStatus.FALHA }).eq("id", cobrancaId);
           throw queueError;
      }
  },

  /**
   * Busca repasses travados (FALHA ou PENDENTE) de um usuário e retenta imediatamente.
   * Chamado quando a chave PIX é validada com sucesso.
   */
  async reprocessarRepassesPendentes(usuarioId: string): Promise<{ retried: number }> {
      logger.info({ usuarioId }, "Buscando repasses pendentes para reprocessamento imediato...");

      const { data: pendencias, error } = await supabaseAdmin
          .from("cobrancas")
          .select("id, valor")
          .eq("usuario_id", usuarioId)
          .eq("status", CobrancaStatus.PAGO)
          .in("status_repasse", [RepasseStatus.FALHA, RepasseStatus.PENDENTE]);

      if (error) {
          logger.error({ error, usuarioId }, "Erro ao buscar repasses para retry imediato");
          return { retried: 0 };
      }

      if (!pendencias || pendencias.length === 0) {
          logger.info({ usuarioId }, "Nenhum repasse pendente encontrado para este usuário.");
          return { retried: 0 };
      }

      logger.info({ usuarioId, count: pendencias.length }, "Reprocessando repasses acumulados...");

      let retriedCount = 0;
      for (const cobranca of pendencias) {
          try {
              await this.iniciarRepasse(cobranca.id);
              retriedCount++;
              // Pequeno delay para evitar rate limit
              await new Promise(r => setTimeout(r, 200));
          } catch (err) {
              logger.error({ err, cobrancaId: cobranca.id }, "Falha ao retentar repasse individualmente");
          }
      }

      return { retried: retriedCount };
  }
};
