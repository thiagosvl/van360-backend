import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { addToPayoutQueue } from "../queues/payout.queue.js";
import { RegistrarPagamentoManualDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, CobrancaTipoPagamento, PixKeyStatus, RepasseState } from "../types/enums.js";
import { cobrancaService } from "./cobranca.service.js";
import { historicoService } from "./historico.service.js";
import { paymentService } from "./payment.service.js";
import { planRules } from "./plan-rules.service.js";
import { repasseFsmService } from "./repasse-fsm.service.js";

import crypto from "node:crypto";
import { toLocalDateString } from "../utils/date.utils.js";

interface PagamentoInfo {
    horario?: string | Date;
    [key: string]: any;
}

export const cobrancaPagamentoService = {
  
  async processarPagamento(txid: string, valor: number, pagamento: PagamentoInfo, reciboUrl?: string): Promise<boolean> {
        const { data: cobranca } = await supabaseAdmin
            .from("cobrancas")
            .select("id, status, gateway_txid, usuario_id")
            .eq("gateway_txid", txid)
            .single();

        if (!cobranca) throw new Error("Cobrança não encontrada pelo TXID");

        if (cobranca.status === CobrancaStatus.PAGO) {
            logger.info({ txid, cobrancaId: cobranca.id }, "[cobrancaPagamentoService.processarPagamento] Cobrança já está paga. Ignorando atualização redundante.");
            return true;
        }

        // Se for uma baixa de PIX sistemático, não precisamos cancelar nada, apenas registrar.
        // Mas se por acaso o motorista estivesse tentando registrar MANUALMENTE uma cobrança que tem um PIX ativo,
        // esse fluxo aqui é o do WEBHOOK (Sistemático).
        // O fluxo de registro MANUAL pelo motorista (que requer cancelamento) deve estar em outro lugar ou ser tratado aqui se for chamado pela controller manual.

        logger.info({ txid, valor, cobrancaId: cobranca.id }, "[cobrancaPagamentoService.processarPagamento] Registrando pagamento via PIX");

        const { error } = await supabaseAdmin
            .from("cobrancas")
            .update({
                status: CobrancaStatus.PAGO,
                valor_pago: valor,
                tipo_pagamento: CobrancaTipoPagamento.PIX,
                data_pagamento: pagamento.horario || new Date(),
                dados_auditoria_pagamento: pagamento,
                recibo_url: reciboUrl,
                pagamento_manual: false // Webhook sempre marca como false
            })
            .eq("id", cobranca.id);
            
        if (error) {
            logger.error({ error, cobrancaId: cobranca.id, txid }, "[cobrancaPagamentoService.processarPagamento] Erro ao atualizar cobrança para PAGO");
            throw error;
        }
        
        logger.info({ cobrancaId: cobranca.id, txid }, "✅ Pagamento processado e registrado com sucesso.");

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: cobranca.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
            entidade_id: cobranca.id,
            acao: AtividadeAcao.BAIXA_BANCARIA,
            descricao: `Confirmação de recebimento via PIX (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)}).`,
            meta: { valor, txid, canal: 'PIX-BANK' }
        });

        return true;
  },

  /**
   * Registra um pagamento manual feito pelo motorista.
   * ATENÇÃO: Se a cobrança tiver um PIX ativo, tenta cancelar ANTES de salvar.
   */
  async registrarPagamentoManual(cobrancaId: string, data: RegistrarPagamentoManualDTO): Promise<any> {
      logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoManual] Iniciando registro");

      const { data: cobranca, error: findError } = await supabaseAdmin
          .from("cobrancas")
          .select("*, passageiro:passageiros(nome_responsavel, cpf_responsavel)")
          .eq("id", cobrancaId)
          .single();

      if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
      if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);

      // 1. CANCELAR PIX SE EXISTIR (ESTRITO/SÍNCRONO)
      if (cobranca.gateway_txid) {
          try {
              logger.info({ cobrancaId, txid: cobranca.gateway_txid }, "Cancelando PIX existente antes de baixa manual...");
              const provider = paymentService.getProvider();
              await provider.cancelarCobranca(cobranca.gateway_txid, 'cobv');
          } catch (err: any) {
              const detail = (err.response?.data?.detail || "").toLowerCase();
              const message = (err.message || "").toLowerCase();
              
              const isAlreadyPaid = 
                detail.includes("concluida") || 
                detail.includes("pago") || 
                detail.includes("paga") ||
                message.includes("pago");

              if (isAlreadyPaid) {
                  throw new AppError("Não foi possível registrar manualmente: O responsável acabou de pagar via PIX no banco agora mesmo.", 400);
              }
              
              logger.error({ err, cobrancaId }, "Erro ao cancelar PIX no banco durante baixa manual.");
              throw new AppError("Não foi possível cancelar o PIX no banco. Ação abortada para segurança. Tente novamente em instantes.", 502);
          }
      }

      // 2. REGISTRAR NO BANCO
      const { data: updated, error } = await supabaseAdmin
          .from("cobrancas")
          .update({
              status: CobrancaStatus.PAGO,
              pagamento_manual: true,
              tipo_pagamento: data.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
              data_pagamento: data.data_pagamento || new Date(),
              valor_pago: data.valor_pago || cobranca.valor,
              // Limpar dados do PIX cancelado para não aparecer na tela como opção
              gateway_txid: null,
              qr_code_payload: null,
              location_url: null
          })
          .eq("id", cobrancaId)
          .select()
          .single();

      if (error) throw new AppError(`Erro ao registrar pagamento: ${error.message}`, 500);

      historicoService.log({
          usuario_id: cobranca.usuario_id,
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: cobrancaId,
          acao: AtividadeAcao.PAGAMENTO_MANUAL,
          descricao: `Pagamento manual de ${updated.mes}/${updated.ano} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updated.valor_pago)}) do passageiro ${cobranca.passageiro?.nome || cobranca.passageiros?.nome} registrado.`,
          meta: {
              valor_pago: updated.valor_pago,
              tipo_pagamento: updated.tipo_pagamento,
              data_pagamento: updated.data_pagamento,
              passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome
          }
      });

      return updated;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão de pagamento manual");

    const { data: cobranca, error: findError } = await supabaseAdmin
      .from("cobrancas")
      .select("*, passageiro:passageiros(*, escola:escolas(nome), veiculo:veiculos(placa))")
      .eq("id", cobrancaId)
      .single();

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    if (!cobranca.pagamento_manual) {
      throw new AppError("Não é permitido desfazer este pagamento: apenas recebimentos marcados manualmente pelo motorista podem ser revertidos.", 400);
    }

    // --- LOGICA DE REGENERAÇÃO DE PIX (ATÔMICA) ---
    let pixData: any = {};
    
    // Verificar se o motorista deve ter PIX (Plano Profissional/Empresarial)
    const { data: assinatura } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select("planos(slug, parent:parent_id(slug))")
      .eq("usuario_id", cobranca.usuario_id)
      .eq("ativo", true)
      .maybeSingle();

    const planoData = assinatura?.planos as any;
    const slugBase = planoData?.parent?.slug ?? planoData?.slug;
    const canGeneratePix = planRules.canGeneratePix(slugBase);

    if (canGeneratePix && cobranca.passageiro?.cpf_responsavel && cobranca.passageiro?.nome_responsavel) {
        try {
            logger.info({ cobrancaId }, "Regenerando PIX síncrono ao desfazer pagamento manual...");
            const provider = paymentService.getProvider();
            
            // Garantir que a data de vencimento não é no passado
            const todayStr = toLocalDateString(new Date());
            const novaDataVencimento = cobranca.data_vencimento < todayStr ? todayStr : cobranca.data_vencimento;

            const novoTxid = crypto.randomUUID();
            const pixResult = await provider.criarCobrancaComVencimento({
              cobrancaId: novoTxid,
              valor: cobranca.valor,
              cpf: cobranca.passageiro.cpf_responsavel,
              nome: cobranca.passageiro.nome_responsavel,
              dataVencimento: novaDataVencimento
            });

            pixData = {
              gateway_txid: pixResult.gatewayTransactionId,
              qr_code_payload: pixResult.qrCodePayload,
              location_url: pixResult.location
            };
        } catch (err: any) {
            logger.error({ err, cobrancaId }, "Erro ao regenerar PIX durante o desfazimento.");
            throw new AppError("Não foi possível reabrir a cobrança: Falha ao gerar novo PIX no banco. Tente novamente em instantes.", 502);
        }
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
        ...pixData // Injeta os novos dados do PIX
      })
      .eq("id", cobrancaId)
      .select()
      .single();

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    // --- NOTIFICAR O PAI (BACKGROUND) ---
    if (pixData.gateway_txid) {
        cobrancaService.enviarNotificacaoManual(cobrancaId).catch(err => {
            logger.error({ err, cobrancaId }, "Falha ao enviar notificação automática após desfazer pagamento.");
        });
    }

    // --- LOG DE AUDITORIA ---
    historicoService.log({
        usuario_id: cobranca.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: cobrancaId,
        acao: AtividadeAcao.PAGAMENTO_REVERTIDO,
        descricao: `Pagamento de ${cobranca.mes}/${cobranca.ano} do passageiro ${cobranca.passageiro?.nome || cobranca.passageiros?.nome} desfeito pelo motorista.`,
        meta: { 
          cobranca_id: cobrancaId,
          passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome,
          mes: cobranca.mes,
          ano: cobranca.ano,
          valor: cobranca.valor,
          novo_txid: pixData.gateway_txid || null
        }
    });

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
