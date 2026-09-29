import { NotificationChannelEnum } from '../types/enums.js';
import { logger } from "../config/logger.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { AppError } from "../errors/AppError.js";
import { RegistrarPagamentoManualDTO, ComplementarPagamentoManualDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, CobrancaTipoPagamento, TipoResponsavel } from "../types/enums.js";
import { getNowBR, toPersistenceString } from "../utils/date.utils.js";
import { getFirstAndSecondName } from "../utils/format.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";
import { reciboAnualService } from "./recibo-anual.service.js";
import type { Tables } from "../types/database.types.js";

type CobrancaRow = Tables<"cobrancas">;

interface ResponsavelLinkItem {
  tipo?: string;
  responsavel?: { nome?: string; telefone?: string } | Array<{ nome?: string; telefone?: string }>;
}

export const cobrancaPagamentoService = {
  async registrarPagamentoManual(cobrancaId: string, data: RegistrarPagamentoManualDTO): Promise<CobrancaRow> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoManual] Iniciando registro");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);

    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);
    if (cobranca.status === CobrancaStatus.CANCELADA) throw new AppError("Esta cobrança está cancelada.", 400);

    const dataPagamentoStr = data.data_pagamento ? toPersistenceString(data.data_pagamento) : toPersistenceString(getNowBR());

    const { data: updated, error } = await cobrancaRepository.registrarPagamentoManual(cobrancaId, {
      status: CobrancaStatus.PAGO,
      pagamento_manual: true,
      tipo_pagamento: data.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
      data_pagamento: dataPagamentoStr,
      valor_pago: data.valor_pago || cobranca.valor,
      ...(data.observacao !== undefined ? { observacao: (data.observacao && data.observacao.trim()) ? data.observacao.trim() : null } : {}),
    });

    if (error) throw new AppError(`Erro ao registrar pagamento: ${error.message}`, 500);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_MANUAL,
      descricao: `Pagamento manual de ${updated.mes}/${updated.ano} (${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updated.valor_pago)}) do aluno ${getFirstAndSecondName(cobranca.passageiro?.nome || cobranca.passageiros?.nome)} registrado.`,
      meta: {
        valor_pago: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome
      }
    });

    try {
      const reciboUrl = await receiptService.generateForCobranca(cobrancaId);
      if (!reciboUrl) {
        throw new Error("Não foi possível gerar o recibo. O pagamento não foi registrado.");
      }
      updated.recibo_url = reciboUrl;
    } catch (receiptError: unknown) {
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

    if (updated.recibo_url) {
      try {
        const { data: cobrancaCompleta } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);
        const passageiroInfo = cobrancaCompleta?.passageiro as (Record<string, unknown> & { responsaveis?: ResponsavelLinkItem[] }) | undefined;
        const motoristaInfo = cobrancaCompleta?.motorista as { nome?: string; apelido?: string; razao_social?: string } | undefined;
        const links = passageiroInfo?.responsaveis || [];
        const respLink = links.find((r) => r.tipo === TipoResponsavel.PRINCIPAL) || links[0];
        const respObj = Array.isArray(respLink?.responsavel) ? respLink.responsavel[0] : (respLink?.responsavel || {});
        const phoneResp = respObj?.telefone;
        const nameResp = respObj?.nome || (passageiroInfo?.nome as string | undefined) || "";

        if (phoneResp) {
          const { notificationService } = await import("./notifications/notification.service.js");
          const { EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO } = await import("../config/constants.js");
          const { getDriverDisplayName } = await import("../utils/format.js");
          await notificationService.notifyPassenger(
            phoneResp,
            EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
            {
              nomeResponsavel: nameResp,
              nomePassageiro: (passageiroInfo?.nome as string | undefined) || "",
              nomeMotorista: getDriverDisplayName(motoristaInfo),
              apelidoMotorista: motoristaInfo?.apelido,
              valor: Number(updated.valor_pago || updated.valor),
              dataPagamento: updated.data_pagamento || undefined,
              mes: updated.mes,
              ano: updated.ano,
              reciboUrl: updated.recibo_url,
              usuarioId: updated.usuario_id,
              passageiroId: updated.passageiro_id
            },
            {
              channels: [NotificationChannelEnum.FIREBASE],
              usuarioId: updated.usuario_id,
              passageiroId: updated.passageiro_id || undefined
            }
          );
        }
      } catch (notifErr: unknown) {
        const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
        logger.error({ error: msg, cobrancaId }, "Erro ao enviar recibo pós-pagamento manual");
      }
    }

    return updated;
  },

  async desfazerPagamento(cobrancaId: string): Promise<CobrancaRow> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão de pagamento manual");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);

    if (findError || !cobranca) {
      throw new AppError("Cobrança não encontrada.", 404);
    }

    const { data, error } = await cobrancaRepository.desfazerPagamento(cobrancaId);

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_REVERTIDO,
      descricao: `Pagamento de ${cobranca.mes}/${cobranca.ano} do aluno ${getFirstAndSecondName(cobranca.passageiro?.nome || cobranca.passageiros?.nome)} desfeito pelo motorista.`,
      meta: {
        cobranca_id: cobrancaId,
        passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome,
        mes: cobranca.mes,
        ano: cobranca.ano,
        valor: cobranca.valor
      }
    });

    if (cobranca.recibo_url) {
      await receiptService.deleteReceipt(cobranca.recibo_url);
    }

    if (cobranca.passageiro_id && cobranca.ano) {
      await reciboAnualService.removerReciboAnualSeExistir(cobranca.passageiro_id, cobranca.ano);
    }

    return data;
  },

  async complementarPagamentoManual(cobrancaId: string, data: ComplementarPagamentoManualDTO): Promise<CobrancaRow> {
    logger.info({ cobrancaId, valorAdicional: data.valor_adicional }, "[cobrancaPagamentoService.complementarPagamentoManual] Iniciando complementação");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);

    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status !== CobrancaStatus.PAGO) {
      throw new AppError("Apenas cobranças que já possuem pagamento registrado podem ser complementadas.", 400);
    }
    if (cobranca.status === CobrancaStatus.CANCELADA) {
      throw new AppError("Esta cobrança está cancelada.", 400);
    }

    const valorAdicional = Number(data.valor_adicional);
    if (isNaN(valorAdicional) || valorAdicional <= 0) {
      throw new AppError("O valor adicional deve ser maior que zero.", 400);
    }

    const valorAnterior = Number(cobranca.valor_pago || 0);
    const novoValorPago = valorAnterior + valorAdicional;
    const dataPagamentoStr = data.data_pagamento ? toPersistenceString(data.data_pagamento) : toPersistenceString(getNowBR());

    if (cobranca.recibo_url) {
      try {
        await receiptService.deleteReceipt(cobranca.recibo_url);
      } catch (delErr: unknown) {
        logger.warn({ error: delErr, cobrancaId }, "[cobrancaPagamentoService.complementarPagamentoManual] Erro ao deletar recibo anterior");
      }
    }

    const { data: updated, error } = await cobrancaRepository.update(cobrancaId, {
      valor_pago: novoValorPago,
      data_pagamento: dataPagamentoStr,
      tipo_pagamento: data.tipo_pagamento || cobranca.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
      pagamento_manual: true,
      recibo_url: null,
      ...(data.observacao !== undefined ? { observacao: (data.observacao && data.observacao.trim()) ? data.observacao.trim() : null } : {}),
    });

    if (error) throw new AppError(`Erro ao atualizar pagamento: ${error.message}`, 500);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_COMPLEMENTAR,
      descricao: `Pagamento complementar de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorAdicional)} para ${updated.mes}/${updated.ano} do aluno ${getFirstAndSecondName(cobranca.passageiro?.nome || cobranca.passageiros?.nome)} registrado. Total acumulado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(updated.valor_pago)}.`,
      meta: {
        valor_adicional: valorAdicional,
        valor_pago_anterior: valorAnterior,
        valor_pago_acumulado: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: cobranca.passageiro?.nome || cobranca.passageiros?.nome
      }
    });

    try {
      const reciboUrl = await receiptService.generateForCobranca(cobrancaId);
      if (!reciboUrl) {
        throw new Error("Não foi possível gerar o recibo atualizado.");
      }
      updated.recibo_url = reciboUrl;
    } catch (receiptError: unknown) {
      const msg = receiptError instanceof Error ? receiptError.message : String(receiptError);
      logger.error({ error: msg, cobrancaId }, "Erro ao gerar recibo atualizado");
      throw new AppError(msg || "Erro ao gerar recibo atualizado.", 500);
    }

    if (updated.recibo_url) {
      try {
        const { data: cobrancaCompleta } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);
        const passageiroInfo = cobrancaCompleta?.passageiro as (Record<string, unknown> & { responsaveis?: ResponsavelLinkItem[] }) | undefined;
        const motoristaInfo = cobrancaCompleta?.motorista as { nome?: string; apelido?: string; razao_social?: string } | undefined;
        const links = passageiroInfo?.responsaveis || [];
        const respLink = links.find((r) => r.tipo === TipoResponsavel.PRINCIPAL) || links[0];
        const respObj = Array.isArray(respLink?.responsavel) ? respLink.responsavel[0] : (respLink?.responsavel || {});
        const phoneResp = respObj?.telefone;
        const nameResp = respObj?.nome || (passageiroInfo?.nome as string | undefined) || "";

        if (phoneResp) {
          const { notificationService } = await import("./notifications/notification.service.js");
          const { EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO } = await import("../config/constants.js");
          const { getDriverDisplayName } = await import("../utils/format.js");
          await notificationService.notifyPassenger(
            phoneResp,
            EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
            {
              nomeResponsavel: nameResp,
              nomePassageiro: (passageiroInfo?.nome as string | undefined) || "",
              nomeMotorista: getDriverDisplayName(motoristaInfo),
              apelidoMotorista: motoristaInfo?.apelido,
              valor: Number(updated.valor_pago || updated.valor),
              dataPagamento: updated.data_pagamento || undefined,
              mes: updated.mes,
              ano: updated.ano,
              reciboUrl: updated.recibo_url,
              usuarioId: updated.usuario_id,
              passageiroId: updated.passageiro_id
            },
            {
              channels: [NotificationChannelEnum.FIREBASE],
              usuarioId: updated.usuario_id,
              passageiroId: updated.passageiro_id || undefined
            }
          );
        }
      } catch (notifErr: unknown) {
        const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
        logger.error({ error: msg, cobrancaId }, "Erro ao enviar recibo pós-complementação de pagamento");
      }
    }

    return updated;
  },
};
