import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPayoutQueue } from "../queues/payout.queue.js";
import { CobrancaStatus, CobrancaTipoPagamento, PixKeyStatus, RepasseStatus, TransactionStatus } from "../types/enums.js";
import { paymentService } from "./payment.service.js";

interface PagamentoInfo {
    horario?: string | Date;
    [key: string]: any;
}

export const cobrancaPagamentoService = {
  
  async processarPagamento(txid: string, valor: number, pagamento: PagamentoInfo, reciboUrl?: string): Promise<boolean> {
       // Buscar Cobrança pelo TXID
       const { data: cobranca } = await supabaseAdmin.from("cobrancas").select("id, status").eq("gateway_txid", txid).single();
       if (!cobranca) throw new Error("Cobrança não encontrada pelo TXID");

       if (cobranca.status === CobrancaStatus.PAGO) {
           logger.info({ txid, cobrancaId: cobranca.id }, "[cobrancaPagamentoService.processarPagamento] Cobrança já está paga. Ignorando atualização redundante.");
           return true;
       }

        logger.info({ txid, valor, cobrancaId: cobranca.id }, "[cobrancaPagamentoService.processarPagamento] Registrando pagamento via PIX");

        const { error } = await supabaseAdmin
            .from("cobrancas")
            .update({
                status: CobrancaStatus.PAGO,
                valor_pago: valor,
                tipo_pagamento: CobrancaTipoPagamento.PIX,
                data_pagamento: pagamento.horario || new Date(),
                dados_auditoria_pagamento: pagamento,
                recibo_url: reciboUrl
            })
            .eq("id", cobranca.id);
            
        if (error) {
            logger.error({ error, cobrancaId: cobranca.id, txid }, "[cobrancaPagamentoService.processarPagamento] Erro ao atualizar cobrança para PAGO");
            throw error;
        }
        
        logger.info({ cobrancaId: cobranca.id, txid }, "✅ Pagamento processado e registrado com sucesso.");
        return true;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão de pagamento manual");

    // 1. Buscar a cobrança para validar se é pagamento manual
    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("cobrancas")
      .select("id, pagamento_manual, status, status_repasse")
      .eq("id", cobrancaId)
      .single();

    if (findError || !cobranca) {
      logger.warn({ findError, cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Cobrança não encontrada");
      throw new AppError("Cobrança não encontrada.", 404);
    }

    // 2. Validar se é pagamento manual e se já foi repassado
    if (!cobranca.pagamento_manual) {
      logger.warn({ cobrancaId, status: cobranca.status }, "[cobrancaPagamentoService.desfazerPagamento] Tentativa de desfazer pagamento não manual");
      throw new AppError("Apenas pagamentos manuais podem ser desfeitos.", 400);
    }

    if (cobranca.status_repasse === RepasseStatus.REPASSADO) {
        logger.warn({ cobrancaId, status_repasse: cobranca.status_repasse }, "[cobrancaPagamentoService.desfazerPagamento] Tentativa de desfazer pagamento já repassado");
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
      logger.info({ cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Iniciando fluxo de repasse");

      // 1. Buscar Cobrança
      const { data: cobranca } = await supabaseAdmin.from("cobrancas").select("id, usuario_id, valor, status_repasse, status").eq("id", cobrancaId).single();
      
      if (!cobranca) {
          logger.error({ cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Cobrança não encontrada");
          throw new AppError("Cobrança não encontrada para repasse.", 404);
      }

      if (cobranca.status !== CobrancaStatus.PAGO) {
          logger.warn({ cobrancaId, status: cobranca.status }, "[cobrancaPagamentoService.iniciarRepasse] Tentativa de repassar cobrança não paga");
          return { success: false, reason: "cobranca_nao_paga" };
      }

      if (cobranca.status_repasse === RepasseStatus.REPASSADO) {
          logger.warn({ cobrancaId }, "Repasse já realizado anteriormente.");
          return { success: true, alreadyDone: true };
      }

      // 2. Buscar Motorista e Validar Chave PIX
      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("id, chave_pix, status_chave_pix, nome")
        .eq("id", cobranca.usuario_id)
        .single();

      const hasValidPix = usuario?.chave_pix && usuario?.status_chave_pix === PixKeyStatus.VALIDADA;
      logger.info({ cobrancaId, motoristaId: usuario?.id, hasValidPix, statusPix: usuario?.status_chave_pix }, "[cobrancaPagamentoService.iniciarRepasse] Verificação de chave PIX");

      // 3. Calcular Valor do Repasse (Valor Integral)
      // O motorista deve receber o valor total pago pelo pai. 
      // A taxa do Inter (custo variável) é absorvida pelo Van360.
      const valorRepasse = cobranca.valor;
      const provider = paymentService.getProvider();
      const taxaAbsorvida = await provider.getFee(cobranca.valor, 'vencimento'); 
      
      logger.info({ 
        cobrancaId, 
        valorOriginal: cobranca.valor, 
        valorRepasse, 
        taxaAbsorvida,
        tipoPix: 'vencimento' 
      }, "[cobrancaPagamentoService.iniciarRepasse] Repasse integral (Taxa absorvida pelo Van360)");

      if (valorRepasse <= 0) {
           logger.warn({ cobrancaId, valorOriginal: cobranca.valor, taxaAbsorvida, valorRepasse }, "Valor do repasse zerado ou insuficiente.");
           return { success: false, reason: "valor_baixo" };
      }

      // 4. Registrar Transação no Banco (Pendente ou Falha por Chave)
      const transacaoData: any = {
          cobranca_id: cobrancaId,
          usuario_id: cobranca.usuario_id,
          valor_repassado: valorRepasse,
          status: hasValidPix ? TransactionStatus.PROCESSAMENTO : TransactionStatus.ERRO, 
          data_criacao: new Date()
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
          logger.error({ txError, cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Erro ao criar transação_repasse");
      } else {
          logger.info({ transacaoId: transacao?.id, status: transacao?.status }, "[cobrancaPagamentoService.iniciarRepasse] Registro de transação criado");
      }

      // 5. Se não tiver PIX válido, abortar repasse automático (avisar motorista no dashboard via status)
      if (!hasValidPix) {
          logger.warn({ cobrancaId, motoristaId: cobranca.usuario_id }, "Repasse abortado: Chave PIX inválida ou ausente");
          
          if (transacao?.id) {
              await supabaseAdmin.from("transacoes_repasse")
                  .update({ 
                      status: TransactionStatus.ERRO, 
                      mensagem_erro: transacaoData.mensagem_erro 
                  }).eq("id", transacao.id);
          }

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
          
          logger.info({ cobrancaId, transacaoId: transacao?.id }, "✅ Repasse enviado para a fila (PayoutQueue)");

          // Atualizar status da cobrança e vincular transação
          await supabaseAdmin.from("cobrancas").update({ 
              status_repasse: RepasseStatus.PENDENTE,
              id_transacao_repasse: transacao?.id
          }).eq("id", cobrancaId);

          return { success: true, queued: true, transacaoId: transacao?.id };

      } catch (queueError) {
           logger.error({ queueError, cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Falha ao adicionar à PayoutQueue");
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
