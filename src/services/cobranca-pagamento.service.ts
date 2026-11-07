import {
  AtividadeAcao,
  AtividadeEntidadeTipo,
  CobrancaStatus,
  CobrancaTipoPagamento,
  NotificationChannelEnum,
  ProvedorPagamentoEnum,
} from "../types/enums.js";
import { logger } from "../config/logger.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { historicoRepository } from "../repositories/historico.repository.js";
import { cobrancaValidacaoService } from "./cobranca-validacao.service.js";
import { AppError } from "../errors/AppError.js";
import {
  ComplementarPagamentoManualDTO,
  RegistrarPagamentoManualDTO,
} from "../types/dtos/cobranca.dto.js";
import {
  EVENTO_MOTORISTA_PAGAMENTO_RECEBIDO_AUTOMATICO,
  EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
} from "../config/constants.js";
import { getNowBR, toPersistenceString } from "../utils/date.utils.js";
import { getDriverDisplayName, getFirstAndSecondName } from "../utils/format.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";
import { reciboAnualService } from "./recibo-anual.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { getResponsavelFromPassageiro, PassageiroCobrancaInfo } from "./cobranca-helpers.js";
import type { Tables } from "../types/database.types.js";

type CobrancaRow = Tables<"cobrancas">;

const formatBRL = (value: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const extractPassageiroNome = (cobranca: Record<string, unknown>): string | undefined => {
  const pass = (cobranca.passageiro || cobranca.passageiros) as { nome?: string } | undefined;
  return pass?.nome;
};

export const notifyReciboPassageiro = async (
  cobrancaId: string,
  updated: CobrancaRow,
  channels: NotificationChannelEnum[]
): Promise<{ sent: boolean; nomePassageiro: string; nomeResponsavel: string; motoristaInfo?: { id?: string; nome?: string; apelido?: string | null; razao_social?: string | null; telefone?: string | null; email?: string | null } }> => {
  if (!updated.recibo_url) {
    return { sent: false, nomePassageiro: "", nomeResponsavel: "" };
  }

  const { data: cobrancaCompleta } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);
  const passageiroInfo = cobrancaCompleta?.passageiro as PassageiroCobrancaInfo | undefined;
  const motoristaInfo = cobrancaCompleta?.motorista as
    | { id?: string; nome?: string; apelido?: string | null; razao_social?: string | null; telefone?: string | null; email?: string | null }
    | undefined;
  const resp = getResponsavelFromPassageiro(passageiroInfo);
  const nomePassageiro = passageiroInfo?.nome || "";
  const nomeResponsavel = resp.nome || nomePassageiro;

  if (!resp.telefone) {
    return { sent: false, nomePassageiro, nomeResponsavel, motoristaInfo };
  }

  const sent = await notificationService.notifyPassenger(
    resp.telefone,
    EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
    {
      nomeResponsavel,
      nomePassageiro,
      nomeMotorista: getDriverDisplayName(motoristaInfo),
      apelidoMotorista: motoristaInfo?.apelido || undefined,
      valor: Number(updated.valor_pago || updated.valor),
      dataPagamento: updated.data_pagamento || undefined,
      mes: updated.mes,
      ano: updated.ano,
      reciboUrl: updated.recibo_url,
      usuarioId: updated.usuario_id || undefined,
      passageiroId: updated.passageiro_id || undefined,
    },
    {
      channels,
      usuarioId: updated.usuario_id || undefined,
      passageiroId: updated.passageiro_id || undefined,
      email: resp.email || undefined,
    }
  );

  return { sent, nomePassageiro, nomeResponsavel, motoristaInfo };
};

export const cobrancaPagamentoService = {
  async registrarPagamentoManual(cobrancaId: string, data: RegistrarPagamentoManualDTO): Promise<CobrancaRow> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoManual] Iniciando registro");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);

    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status === CobrancaStatus.PAGO) throw new AppError("Esta cobrança já está paga.", 400);
    if (cobranca.status === CobrancaStatus.CANCELADA) throw new AppError("Esta cobrança está cancelada.", 400);

    await cobrancaValidacaoService.validarImpedimentoPorRepasse(
      cobrancaId,
      cobranca,
      "registrar pagamento manual"
    );

    const dataPagamentoStr = data.data_pagamento
      ? toPersistenceString(data.data_pagamento)
      : toPersistenceString(getNowBR());

    const { data: updated, error } = await cobrancaRepository.registrarPagamentoManual(cobrancaId, {
      status: CobrancaStatus.PAGO,
      pagamento_manual: true,
      tipo_pagamento: data.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
      data_pagamento: dataPagamentoStr,
      valor_pago: data.valor_pago || cobranca.valor,
      repasse_em_processamento: false,
      ...(data.observacao !== undefined
        ? { observacao: data.observacao && data.observacao.trim() ? data.observacao.trim() : null }
        : {}),
    });

    if (error || !updated) throw new AppError(`Erro ao registrar pagamento: ${error?.message}`, 500);

    const passageiroNome = extractPassageiroNome(cobranca as unknown as Record<string, unknown>);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_MANUAL,
      descricao: `Pagamento manual de ${updated.mes}/${updated.ano} (${formatBRL(Number(updated.valor_pago))}) do aluno ${getFirstAndSecondName(passageiroNome)} registrado.`,
      meta: {
        valor_pago: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: passageiroNome,
      },
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
        tipo_pagamento: null,
      });

      const msg = receiptError instanceof Error ? receiptError.message : String(receiptError);
      logger.error({ error: msg, cobrancaId }, "Erro ao gerar recibo - Pagamento revertido");
      throw new AppError(msg || "Erro ao gerar recibo.", 500);
    }

    if (cobranca.provedor_cobranca_id) {
      await cobrancaValidacaoService.cancelarPixCobrancaSeExistir(
        cobrancaId,
        cobranca.provedor_cobranca_id,
        cobranca.provedor
      );
    }

    await historicoRepository.deleteFalhaIntegracaoByEntidadeId(cobrancaId);

    try {
      await notifyReciboPassageiro(cobrancaId, updated, [NotificationChannelEnum.FIREBASE]);
    } catch (notifErr: unknown) {
      const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
      logger.error({ error: msg, cobrancaId }, "Erro ao enviar recibo pós-pagamento manual");
    }

    return updated;
  },

  async desfazerPagamento(cobrancaId: string): Promise<CobrancaRow> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.desfazerPagamento] Iniciando reversão");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);
    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status !== CobrancaStatus.PAGO) {
      throw new AppError("Esta cobrança não está com pagamento registrado.", 400);
    }
    if (!cobranca.pagamento_manual) {
      throw new AppError("Não é permitido desfazer cobranças liquidadas automaticamente via Pix.", 400);
    }

    await cobrancaValidacaoService.validarImpedimentoPorRepasse(cobrancaId, cobranca, "desfazer pagamento");

    const { data, error } = await cobrancaRepository.desfazerPagamento(cobrancaId);
    if (error || !data) {
      logger.error({ error, cobrancaId }, "Erro ao desfazer pagamento da cobrança");
      throw new AppError("Erro ao desfazer pagamento.", 500);
    }

    const passageiroNome = extractPassageiroNome(cobranca as unknown as Record<string, unknown>);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_REVERTIDO,
      descricao: `Pagamento de ${cobranca.mes}/${cobranca.ano} do aluno ${getFirstAndSecondName(passageiroNome)} desfeito pelo motorista.`,
      meta: {
        cobranca_id: cobrancaId,
        passageiro: passageiroNome,
        mes: cobranca.mes,
        ano: cobranca.ano,
        valor: cobranca.valor,
      },
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
    logger.info(
      { cobrancaId, valorAdicional: data.valor_adicional },
      "[cobrancaPagamentoService.complementarPagamentoManual] Iniciando complementação"
    );

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);
    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status !== CobrancaStatus.PAGO) {
      throw new AppError("Apenas cobranças que já possuem pagamento registrado podem ser complementadas.", 400);
    }
    if (cobranca.status === CobrancaStatus.CANCELADA) throw new AppError("Esta cobrança está cancelada.", 400);
    if (!cobranca.pagamento_manual) {
      throw new AppError("Não é permitido complementar manualmente cobranças liquidadas automaticamente via Pix.", 400);
    }

    await cobrancaValidacaoService.validarImpedimentoPorRepasse(cobrancaId, cobranca, "complementar pagamento");

    const valorAdicional = Number(data.valor_adicional);
    if (isNaN(valorAdicional) || valorAdicional <= 0) {
      throw new AppError("O valor adicional deve ser maior que zero.", 400);
    }

    const valorAnterior = Number(cobranca.valor_pago || 0);
    const novoValorPago = valorAnterior + valorAdicional;
    const dataPagamentoStr = data.data_pagamento
      ? toPersistenceString(data.data_pagamento)
      : toPersistenceString(getNowBR());

    if (cobranca.recibo_url) {
      try {
        await receiptService.deleteReceipt(cobranca.recibo_url);
      } catch (delErr: unknown) {
        logger.warn({ error: delErr, cobrancaId }, "Erro ao deletar recibo anterior");
      }
    }

    const { data: updated, error } = await cobrancaRepository.update(cobrancaId, {
      valor_pago: novoValorPago,
      data_pagamento: dataPagamentoStr,
      tipo_pagamento: data.tipo_pagamento || cobranca.tipo_pagamento || CobrancaTipoPagamento.DINHEIRO,
      pagamento_manual: true,
      recibo_url: null,
      ...(data.observacao !== undefined
        ? { observacao: data.observacao && data.observacao.trim() ? data.observacao.trim() : null }
        : {}),
    });

    if (error || !updated) throw new AppError(`Erro ao atualizar pagamento: ${error?.message}`, 500);

    const passageiroNome = extractPassageiroNome(cobranca as unknown as Record<string, unknown>);

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.PAGAMENTO_COMPLEMENTAR,
      descricao: `Pagamento complementar de ${formatBRL(valorAdicional)} para ${updated.mes}/${updated.ano} do aluno ${getFirstAndSecondName(passageiroNome)} registrado. Total acumulado: ${formatBRL(Number(updated.valor_pago))}.`,
      meta: {
        valor_adicional: valorAdicional,
        valor_pago_anterior: valorAnterior,
        valor_pago_acumulado: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: passageiroNome,
      },
    });

    try {
      const reciboUrl = await receiptService.generateForCobranca(cobrancaId);
      if (!reciboUrl) throw new Error("Não foi possível gerar o recibo atualizado.");
      updated.recibo_url = reciboUrl;
    } catch (receiptError: unknown) {
      const msg = receiptError instanceof Error ? receiptError.message : String(receiptError);
      logger.error({ error: msg, cobrancaId }, "Erro ao gerar recibo atualizado");
      throw new AppError(msg || "Erro ao gerar recibo atualizado.", 500);
    }

    try {
      await notifyReciboPassageiro(cobrancaId, updated, [NotificationChannelEnum.FIREBASE]);
    } catch (notifErr: unknown) {
      const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
      logger.error({ error: msg, cobrancaId }, "Erro ao enviar recibo pós-complementação");
    }

    return updated;
  },

  async registrarPagamentoAutomatico(
    cobrancaId: string,
    dataPagamento?: string | Date,
    valorPago?: number,
    tipoPagamento?: CobrancaTipoPagamento,
    _provedor?: ProvedorPagamentoEnum,
    pagadorInfo?: { pagadorNome?: string | null; pagadorDocumento?: string | null; pagadorBanco?: string | null }
  ): Promise<CobrancaRow> {
    logger.info({ cobrancaId }, "[cobrancaPagamentoService.registrarPagamentoAutomatico] Baixando cobrança automática");

    const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);
    if (findError || !cobranca) throw new AppError("Cobrança não encontrada.", 404);
    if (cobranca.status === CobrancaStatus.PAGO && !cobranca.pagamento_manual) return cobranca;

    const dataPagamentoStr = dataPagamento ? toPersistenceString(dataPagamento) : toPersistenceString(getNowBR());
    const valorPagoFinal = valorPago && valorPago > 0 ? valorPago : cobranca.valor;

    const { data: updated, error } = await cobrancaRepository.update(cobrancaId, {
      status: CobrancaStatus.PAGO,
      pagamento_manual: false,
      tipo_pagamento: tipoPagamento || CobrancaTipoPagamento.PIX,
      data_pagamento: dataPagamentoStr,
      valor_pago: valorPagoFinal,
      repasse_em_processamento: false,
    });

    if (error || !updated) {
      throw new AppError(`Erro ao atualizar cobrança para pago: ${error?.message || "Erro desconhecido"}`, 500);
    }

    void historicoRepository.deleteFalhaIntegracaoByEntidadeId(cobrancaId);

    const passageiroNome = extractPassageiroNome(cobranca as unknown as Record<string, unknown>);
    const metodoLabel =
      (tipoPagamento || CobrancaTipoPagamento.PIX) === CobrancaTipoPagamento.BOLETO ? "Boleto" : "Pix";

    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.SAAS_PAGAMENTO_RECEBIDO,
      descricao: `Pagamento automático via ${metodoLabel} de ${updated.mes}/${updated.ano} (${formatBRL(Number(updated.valor_pago || updated.valor))}) confirmado com repasse liquidado.`,
      meta: {
        valor_pago: updated.valor_pago,
        tipo_pagamento: updated.tipo_pagamento,
        data_pagamento: updated.data_pagamento,
        passageiro: passageiroNome,
        pagador_nome: pagadorInfo?.pagadorNome || null,
        pagador_documento: pagadorInfo?.pagadorDocumento || null,
        pagador_banco: pagadorInfo?.pagadorBanco || null,
      },
    });

    try {
      const reciboUrl = await receiptService.generateForCobranca(cobrancaId);
      if (reciboUrl) updated.recibo_url = reciboUrl;
    } catch (receiptError: unknown) {
      const msg = receiptError instanceof Error ? receiptError.message : String(receiptError);
      logger.error({ error: msg, cobrancaId }, "Falha ao gerar recibo para cobrança automática");
    }

    let reciboEnviado = false;
    let nomePassageiro = passageiroNome || "";
    let nomeResponsavel = "";
    let motoristaInfo:
      | { id?: string; nome?: string; apelido?: string | null; razao_social?: string | null; telefone?: string | null; email?: string | null }
      | undefined;

    try {
      const configMotorista = await motoristaFinanceiroRepository.getByUsuarioId(updated.usuario_id);
      const permiteRecibo = configMotorista.enviar_recibo_automatico !== false;

      if (permiteRecibo && updated.recibo_url) {
        const res = await notifyReciboPassageiro(cobrancaId, updated, [NotificationChannelEnum.WABA]);
        reciboEnviado = res.sent;
        nomePassageiro = res.nomePassageiro || nomePassageiro;
        nomeResponsavel = res.nomeResponsavel;
        motoristaInfo = res.motoristaInfo;
      } else {
        const { data: cobrancaCompleta } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(cobrancaId);
        const passInfo = cobrancaCompleta?.passageiro as PassageiroCobrancaInfo | undefined;
        motoristaInfo = cobrancaCompleta?.motorista as typeof motoristaInfo;
        const resp = getResponsavelFromPassageiro(passInfo);
        nomePassageiro = passInfo?.nome || nomePassageiro;
        nomeResponsavel = resp.nome || nomePassageiro;
      }
    } catch (notifErr: unknown) {
      const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
      logger.error({ error: msg, cobrancaId }, "Falha ao enviar recibo da cobrança automática");
    }

    try {
      const motoristaId = motoristaInfo?.id || updated.usuario_id;
      const motoristaTelefone = motoristaInfo?.telefone || "";
      const motoristaEmail = motoristaInfo?.email ?? undefined;

      await notificationService.notifyDriver(
        motoristaTelefone,
        EVENTO_MOTORISTA_PAGAMENTO_RECEBIDO_AUTOMATICO,
        {
          valor: Number(updated.valor_pago || updated.valor),
          nomePassageiro,
          nomeResponsavel,
          mes: updated.mes,
          ano: updated.ano,
          reciboEnviado,
          cobrancaId,
          usuarioId: motoristaId,
        },
        {
          channels: [NotificationChannelEnum.FIREBASE],
          usuarioId: motoristaId,
          email: motoristaEmail,
        }
      );
    } catch (driverNotifErr: unknown) {
      const msg = driverNotifErr instanceof Error ? driverNotifErr.message : String(driverNotifErr);
      logger.error({ error: msg, cobrancaId }, "Falha ao notificar motorista sobre pagamento automático");
    }

    return updated;
  },
};
