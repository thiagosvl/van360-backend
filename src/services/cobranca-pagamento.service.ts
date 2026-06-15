import { logger } from "../config/logger.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { AppError } from "../errors/AppError.js";
import { RegistrarPagamentoManualDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, CobrancaTipoPagamento } from "../types/enums.js";
import { getNowBR } from "../utils/date.utils.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";

export const cobrancaPagamentoService = {



  /**
   * Registra um pagamento manual feito pelo motorista.
   */
  async registrarPagamentoManual(cobrancaId: string, data: RegistrarPagamentoManualDTO): Promise<any> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoManual] Iniciando registro");

    const { data: cobranca, error: findError } = await cobrancaRepository.getByIdBasic(cobrancaId);

    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);

    // 2. REGISTRAR NO BANCO
    const { data: updated, error } = await cobrancaRepository.registrarPagamentoManual(cobrancaId, {
        status: CobrancaStatus.PAGO,
        pagamento_manual: true,
        tipo_pagamento: data.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
        data_pagamento: data.data_pagamento || getNowBR(),
        valor_pago: data.valor_pago || cobranca.valor,
    });

    if (error) throw new AppError(`Erro ao registrar pagamento: ${error.message}`, 500);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_MANUAL,
      descricao: `Pagamento manual de ${updated.mes}/${updated.ano} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updated.valor_pago)}) do passageiro ${cobranca.passageiro?.nome} registrado.`,
      meta: {
        valor_pago: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: cobranca.passageiro?.nome
      }
    });

    // 3. GERAR RECIBO (Sincrono e Obrigatorio para consistencia)
    try {
      const reciboUrl = await receiptService.generateForCobranca(cobrancaId);
      if (!reciboUrl) {
        throw new Error("Não foi possível gerar o recibo. O pagamento não foi registrado.");
      }
      updated.recibo_url = reciboUrl;
    } catch (receiptError: unknown) {
      // Rollback manual (setando status de volta ou apenas lancando erro se a transacao nao for SQL)
      // Como ja demos o update, vamos reverter o status caso a geracao do recibo falhe CRITICAMENTE
      await cobrancaRepository.update(cobrancaId, {
        status: cobranca.status,
        pagamento_manual: false,
        data_pagamento: null,
        valor_pago: null,
        tipo_pagamento: null
      });

      const msg = receiptError instanceof Error ? receiptError.message : String(receiptError);
      logger.error({ error: msg, cobrancaId }, "Erro ao gerar recibo - Pagamento revertido para manter consistencia");
      throw new AppError(msg || "Erro ao gerar recibo.", 500);
    }

    return updated;
  },

  async desfazerPagamento(cobrancaId: string): Promise<any> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão de pagamento manual");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    if (!cobranca.pagamento_manual) {
      throw new AppError("Não é permitido desfazer este pagamento: apenas recebimentos marcados manualmente pelo motorista podem ser revertidos.", 400);
    }


    const { data, error } = await cobrancaRepository.desfazerPagamento(cobrancaId);

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    // Notificação de reabertura manual desativada ou simplificada conforme plano base.
    // cobrancaService.enviarNotificacaoManual(cobrancaId).catch((err: any) => {
    //   logger.error({ err, cobrancaId }, "Falha ao enviar notificação manual após desfazer pagamento.");
    // });

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
        valor: cobranca.valor
      }
    });

    // 2. DELETAR RECIBO DO STORAGE
    if (cobranca.recibo_url) {
      await receiptService.deleteReceipt(cobranca.recibo_url);
    }

    return data;
  },
};
