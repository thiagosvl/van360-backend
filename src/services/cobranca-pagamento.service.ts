import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPayoutQueue } from "../queues/payout.queue.js";
import { CobrancaStatus, CobrancaTipoPagamento, PixKeyStatus, RepasseState } from "../types/enums.js";
import { paymentService } from "./payment.service.js";
import { repasseFsmService } from "./repasse-fsm.service.js";

interface PagamentoInfo {
    horario?: string | Date;
    [key: string]: any;
}

export const cobrancaPagamentoService = {
  
  async processarPagamento(txid: string, valor: number, pagamento: PagamentoInfo, reciboUrl?: string): Promise<boolean> {
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

    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("cobrancas")
      .select("id, pagamento_manual, status")
      .eq("id", cobrancaId)
      .single();

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    if (!cobranca.pagamento_manual) {
      throw new AppError("Apenas pagamentos manuais podem ser desfeitos.", 400);
    }

    const repasseAtivo = await repasseFsmService.buscarRepasseAtivo(cobrancaId);
    if (repasseAtivo && repasseAtivo.estado === RepasseState.LIQUIDADO) {
        throw new AppError("Não é possível desfazer: O valor já foi repassado e liquidado ao motorista.", 400);
    }

    if (repasseAtivo) {
        await repasseFsmService.cancelarRepasse(repasseAtivo.id, "Pagamento da cobrança foi desfeito manualmente");
    }

    const { data, error } = await supabaseAdmin
      .from("cobrancas")
      .update({
        status: CobrancaStatus.PENDENTE,
        data_pagamento: null,
        valor_pago: null,
        tipo_pagamento: null,
        pagamento_manual: false,
        recibo_url: null,
        dados_auditoria_pagamento: null,
      })
      .eq("id", cobrancaId)
      .select()
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    return data;
  },

  async iniciarRepasse(cobrancaId: string): Promise<any> {
      logger.info({ cobrancaId }, "[cobrancaPagamentoService.iniciarRepasse] Iniciando fluxo de repasse via FSM");

      const { data: cobranca } = await supabaseAdmin.from("cobrancas").select("id, usuario_id, valor, status").eq("id", cobrancaId).single();
      
      if (!cobranca) {
          throw new AppError("Cobrança não encontrada para repasse.", 404);
      }

      if (cobranca.status !== CobrancaStatus.PAGO) {
          return { success: false, reason: "cobranca_nao_paga" };
      }

      // IDEMPOTÊNCIA: Busca se já existe um repasse em andamento ou se já foi liquidado
      const { data: repasseResolvido } = await supabaseAdmin
        .from("repasses")
        .select("id, estado")
        .eq("cobranca_id", cobrancaId)
        .eq("estado", RepasseState.LIQUIDADO)
        .maybeSingle();

      if (repasseResolvido) {
          logger.info({ cobrancaId }, "Repasse já foi LIQUIDADO anteriormente. Evitando duplicidade.");
          return { success: true, alreadyLiquidated: true, repasseId: repasseResolvido.id };
      }

      const repasseExistente = await repasseFsmService.buscarRepasseAtivo(cobrancaId);
      if (repasseExistente) {
          logger.info({ cobrancaId, repasseId: repasseExistente.id }, "Repasse ativo já existe.");
          return { success: true, alreadyExists: true, repasseId: repasseExistente.id };
      }

      const { data: usuario } = await supabaseAdmin
        .from("usuarios")
        .select("id, chave_pix, status_chave_pix")
        .eq("id", cobranca.usuario_id)
        .single();

      const hasValidPix = usuario?.chave_pix && usuario?.status_chave_pix === PixKeyStatus.VALIDADA;
      
      const valorRepasse = cobranca.valor;
      const provider = paymentService.getActiveGateway(); 

      const repasse = await repasseFsmService.criarRepasse({
          cobrancaId,
          usuarioId: cobranca.usuario_id,
          valor: valorRepasse,
          gateway: provider
      });

      if (!hasValidPix) {
          logger.warn({ cobrancaId, motoristaId: cobranca.usuario_id }, "Repasse criado mas suspenso: Chave PIX inválida");
          
          await repasseFsmService.transicionar(repasse.id, RepasseState.ERRO_DECODIFICACAO, {
              ator: "sistema",
              motivo: !usuario?.chave_pix ? "Chave PIX não cadastrada" : "Chave PIX inválida",
          });

          return { success: false, reason: "pix_invalido", repasseId: repasse.id };
      }

      try {
          await addToPayoutQueue({
              cobrancaId,
              motoristaId: cobranca.usuario_id,
              valorRepasse,
              repasseId: repasse.id
          });
          
          logger.info({ cobrancaId, repasseId: repasse.id }, "✅ Repasse enfileirado com sucesso");
          return { success: true, queued: true, repasseId: repasse.id };

      } catch (queueError) {
           logger.error({ queueError, cobrancaId }, "Falha ao enfileirar repasse");
           throw queueError;
      }
  },

  async reprocessarRepassesPendentes(usuarioId: string): Promise<{ retried: number }> {
      logger.info({ usuarioId }, "Disparando reprocessamento via RepasseRetryJob...");
      const { repasseRetryJob } = await import("./jobs/repasse-retry.job.js");
      await repasseRetryJob.run(); 
      return { retried: 0 }; // O job loga o progresso
  }
};
