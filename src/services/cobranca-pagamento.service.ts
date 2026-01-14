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
                dados_auditoria: pagamento,
                recibo_url: reciboUrl // Url opcional, pode vir null se for via worker
            })
            .eq("id", cobranca.id);
            
        if (error) throw error;
        
        logger.info({ cobrancaId: cobranca.id, txid }, "Pagamento processado e registrado com sucesso.");
        return true;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({
        status: CobrancaStatus.PENDENTE,
        data_pagamento: null,
        valor_pago: null,
        tipo_pagamento: null,
        pagamento_manual: false, // Resetar para garantir
        recibo_url: null,
        dados_auditoria: null // Opcional: limpar dados de auditoria do pagamento desfeito
      })
      .eq("id", cobrancaId)
      .select()
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    // TODO: Considerar se deve cancelar o repasse se já tiver sido iniciado?
    // Por enquanto mantém comportamento original de apenas limpar a cobrança.

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
  }
};
