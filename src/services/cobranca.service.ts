import { NotificationChannelEnum, TipoResponsavel } from '../types/enums.js';
import crypto from "node:crypto";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../config/logger.js";

import { AppError } from "../errors/AppError.js";
import {
  EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
  EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
  EVENTO_PASSAGEIRO_ATRASADO,
  EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS
} from "../config/constants.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { getNowBR, getSafeDueDateString, toPersistenceString, diffInDays, getMonthNameBR, getShortWeekDayBR, parseLocalDate, parseMonthYearFromDateString } from "../utils/date.utils.js";
import { getDriverDisplayName } from "../utils/format.js";

import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, CobrancaStatus, CobrancaTipoPagamento, ConfigKey } from "../types/enums.js";
import { historicoService } from "./historico.service.js";
import { receiptService } from "./receipt.service.js";
import { getConfigNumber } from "./configuracao.service.js";
import { notificationService } from "./notifications/notification.service.js";
import { addToGenerationQueue } from "../queues/generation.queue.js";

interface ResponsavelLinkInfo {
  id?: string;
  tipo?: string;
  parentesco?: string | null;
  responsavel?: {
    id?: string;
    nome?: string;
    telefone?: string;
    cpf?: string;
    email?: string;
  } | {
    id?: string;
    nome?: string;
    telefone?: string;
    cpf?: string;
    email?: string;
  }[];
}

interface PassageiroCobrancaInfo {
  nome?: string;
  responsaveis?: ResponsavelLinkInfo[];
  responsavel_principal?: {
    nome?: string;
    telefone?: string;
    email?: string;
    cpf?: string;
  };
}

const _getResponsavelFromPassageiro = (passageiroInfo?: PassageiroCobrancaInfo | null) => {
  if (!passageiroInfo) return { nome: "", telefone: "", email: "", cpf: "" };
  const respLink = Array.isArray(passageiroInfo.responsaveis)
    ? (passageiroInfo.responsaveis.find((r) => r.tipo === TipoResponsavel.PRINCIPAL) || passageiroInfo.responsaveis[0])
    : null;
  const rawResp = passageiroInfo.responsavel_principal || (respLink ? (Array.isArray(respLink.responsavel) ? respLink.responsavel[0] : respLink.responsavel) : null);
  const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;
  return {
    nome: resp?.nome || "",
    telefone: resp?.telefone || "",
    email: resp?.email || "",
    cpf: resp?.cpf || ""
  };
};

const _enrichCobrancaWithResponsavelPrincipal = (cobranca: Record<string, any>) => {
  if (!cobranca || !cobranca.passageiro) return cobranca;

  const p = cobranca.passageiro;
  const links = (p.responsaveis as ResponsavelLinkInfo[]) || [];
  const principalLink = links.find((l) => l.tipo === TipoResponsavel.PRINCIPAL) || links[0];
  const rawResp = p.responsavel_principal || principalLink?.responsavel;
  const resp = Array.isArray(rawResp) ? rawResp[0] : rawResp;

  const enrichedPassageiro = {
    ...p,
    responsavel_principal: (principalLink && resp) || p.responsavel_principal ? {
      id: resp?.id || null,
      nome: resp?.nome || null,
      telefone: resp?.telefone || null,
      cpf: resp?.cpf || null,
      email: resp?.email || null,
      parentesco: principalLink?.parentesco || (p.responsavel_principal as Record<string, any>)?.parentesco || null
    } : null
  };

  delete enrichedPassageiro.responsaveis;

  return {
    ...cobranca,
    passageiro: enrichedPassageiro
  };
};

const _normalizeText = (text?: string | null): string => {
  if (!text) return "";
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const _filterBySearchTerm = <T extends Record<string, any>>(cobrancas: T[], searchTerm?: string): T[] => {
  if (!searchTerm || !searchTerm.trim()) return cobrancas;
  const term = _normalizeText(searchTerm);
  return cobrancas.filter((c) => {
    const nomePassageiro = _normalizeText(c.passageiro?.nome);
    const nomeRespPrincipal = _normalizeText(c.passageiro?.responsavel_principal?.nome);
    return nomePassageiro.includes(term) || nomeRespPrincipal.includes(term);
  });
};

interface CreateCobrancaOptions {
  skipLog?: boolean;
}

export const cobrancaService = {
  async countByPassageiro(passageiroId: string): Promise<number> {
    const { count, error } = await cobrancaRepository.countByPassageiro(passageiroId);

    if (error) throw error;
    return count || 0;
  },

  async createCobranca(data: CreateCobrancaDTO, options: CreateCobrancaOptions = {}): Promise<any> {
    if (!data.passageiro_id || !data.usuario_id) throw new AppError("Campos obrigatórios ausentes (passageiro_id, usuario_id).", 400);

    const passageiro = await passageiroRepository.getResponsavelInfo(data.passageiro_id);

    if (!passageiro) throw new AppError("Passageiro não encontrado para gerar cobrança.", 404);
    if ((passageiro as any).isento === true) throw new AppError("Passageiro é isento de pagamento e não possui cobranças.", 400);

    const valorNumerico = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;

    const statusVal = data.status || CobrancaStatus.PENDENTE;

    const { data: existingCobranca } = await cobrancaRepository.getByPassageiroMesAno(
      data.passageiro_id,
      Number(data.mes),
      Number(data.ano)
    );

    let inserted: any;

    if (existingCobranca) {
      const updateData: Record<string, any> = {
        valor: valorNumerico,
        data_vencimento: data.data_vencimento,
        status: statusVal,
        data_pagamento: statusVal === CobrancaStatus.PAGO ? (data.data_pagamento || getNowBR().toISOString()) : null,
        tipo_pagamento: statusVal === CobrancaStatus.PAGO ? (data.tipo_pagamento || CobrancaTipoPagamento.PIX) : null,
        valor_pago: statusVal === CobrancaStatus.PAGO ? valorNumerico : null,
        pagamento_manual: statusVal === CobrancaStatus.PAGO,
      };

      if (data.desativar_lembretes !== undefined) {
        updateData.desativar_lembretes = data.desativar_lembretes;
      }

      const { data: updated, error: updateError } = await cobrancaRepository.update(existingCobranca.id, updateData);
      if (updateError || !updated) throw new AppError(`Erro ao atualizar cobrança no banco: ${updateError?.message}`, 500);
      inserted = updated;
    } else {
      const cobrancaId = crypto.randomUUID();
      const cobrancaData = {
        id: cobrancaId,
        passageiro_id: data.passageiro_id,
        usuario_id: data.usuario_id,
        mes: Number(data.mes),
        ano: Number(data.ano),
        valor: valorNumerico,
        data_vencimento: data.data_vencimento,
        status: statusVal,
        data_pagamento: statusVal === CobrancaStatus.PAGO ? (data.data_pagamento || getNowBR().toISOString()) : null,
        tipo_pagamento: statusVal === CobrancaStatus.PAGO ? (data.tipo_pagamento || CobrancaTipoPagamento.PIX) : null,
        valor_pago: statusVal === CobrancaStatus.PAGO ? valorNumerico : null,
        pagamento_manual: statusVal === CobrancaStatus.PAGO,
        desativar_lembretes: data.desativar_lembretes ?? false,
      };

      const { data: created, error: insertError } = await cobrancaRepository.insert(cobrancaData);
      if (insertError || !created) throw new AppError(`Erro ao criar cobrança no banco: ${insertError?.message}`, 500);
      inserted = created;
    }

    if (!options.skipLog) {
      historicoService.log({
        usuario_id: data.usuario_id,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: inserted.id,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: `Cobrança de R$ ${valorNumerico.toFixed(2)} (${data.mes}/${data.ano}) gerada para ${passageiro.nome}.`,
        meta: { passageiro_id: data.passageiro_id, mes: data.mes, ano: data.ano, valor: valorNumerico }
      });
    }

    if (statusVal === CobrancaStatus.PAGO) {
      try {
        const reciboUrl = await receiptService.generateForCobranca(inserted.id);
        if (reciboUrl) {
          await cobrancaRepository.update(inserted.id, { recibo_url: reciboUrl });
          inserted.recibo_url = reciboUrl;
        }

        if (inserted.recibo_url) {
          try {
            const { data: fullCobranca } = await cobrancaRepository.getByIdWithPassageiroAndMotorista(inserted.id);
            const passageiroInfo = fullCobranca?.passageiro as Record<string, any> | undefined;
            const motoristaInfo = fullCobranca?.motorista as Record<string, any> | undefined;

            const respInfo = _getResponsavelFromPassageiro(passageiroInfo);

            if (respInfo.telefone) {
              await notificationService.notifyPassenger(
                respInfo.telefone,
                EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
                {
                  nomeResponsavel: respInfo.nome,
                  nomePassageiro: passageiroInfo?.nome || "",
                  nomeMotorista: getDriverDisplayName(motoristaInfo),
                  apelidoMotorista: motoristaInfo?.apelido,
                  valor: Number(inserted.valor),
                  dataPagamento: inserted.data_pagamento || undefined,
                  mes: inserted.mes,
                  ano: inserted.ano,
                  reciboUrl: inserted.recibo_url,
                  usuarioId: inserted.usuario_id,
                  passageiroId: inserted.passageiro_id
                },
                {
                  channels: [NotificationChannelEnum.FIREBASE],
                  usuarioId: inserted.usuario_id,
                  passageiroId: inserted.passageiro_id || undefined,
                  email: respInfo.email
                }
              );
            }
          } catch (notifErr: unknown) {
            const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
            logger.error({ error: msg, cobrancaId: inserted.id }, "[cobrancaService] Erro ao enviar recibo pós-criação da cobrança já paga");
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error({ error: msg, cobrancaId: inserted.id }, "[cobrancaService] Erro ao gerar recibo na criação");
      }
    }

    return inserted;
  },



  async updateCobranca(id: string, data: Partial<CreateCobrancaDTO>, cobrancaOriginal?: Record<string, any>): Promise<any> {
    if (!id) throw new AppError("ID da cobrança é obrigatório", 400);

    // Buscar cobrança original se não foi fornecida
    if (!cobrancaOriginal) {
      cobrancaOriginal = await this.getCobranca(id);
    }

    const cobrancaData: Record<string, unknown> = {};

    // Mapeamento de campos permitidos para edição de metadados
    if (data.valor !== undefined) cobrancaData.valor = data.valor;
    if (data.data_vencimento !== undefined) cobrancaData.data_vencimento = data.data_vencimento ? toPersistenceString(data.data_vencimento) : undefined;

    // Bloqueio de transição de status via PUT (Diretrizes de Arquitetura)
    if (data.status !== undefined && data.status !== cobrancaOriginal?.status) {
      logger.warn({ cobrancaId: id, from: cobrancaOriginal?.status, to: data.status }, "Tentativa de alteração de status via PUT (updateCobranca) ignorada. Use os endpoints especializados.");
    }

    if (data.tipo_pagamento !== undefined) cobrancaData.tipo_pagamento = data.tipo_pagamento;
    if (data.data_pagamento !== undefined) cobrancaData.data_pagamento = data.data_pagamento;
    if (data.valor_pago !== undefined) cobrancaData.valor_pago = moneyToNumber(data.valor_pago);

    const { data: updated, error } = await cobrancaRepository.update(id, cobrancaData);

    if (error) throw new AppError(`Erro ao atualizar cobrança: ${error.message}`, 500);

    // --- LOG DE AUDITORIA ---
    const passageiroNomeUpdate = cobrancaOriginal?.passageiros?.nome || cobrancaOriginal?.passageiro?.nome;
    historicoService.log({
      usuario_id: cobrancaOriginal?.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EDITADA,
      descricao: `Cobrança de ${cobrancaOriginal?.mes}/${cobrancaOriginal?.ano} do passageiro ${passageiroNomeUpdate} editada pelo motorista.`,
      meta: {
        antes: { valor: cobrancaOriginal?.valor, vencimento: cobrancaOriginal?.data_vencimento },
        depois: { valor: updated.valor, vencimento: updated.data_vencimento },
        passageiro: passageiroNomeUpdate
      }
    });

    return updated;
  },



  async getCobranca(id: string): Promise<any> {
    const { data, error } = await cobrancaRepository.getById(id);

    if (error) throw new AppError("Cobrança não encontrada.", 404);

    return _enrichCobrancaWithResponsavelPrincipal(data);
  },

  async deleteCobranca(id: string): Promise<void> {
    const { data: cobranca, error: fetchError } = await cobrancaRepository.getByIdBasic(id);

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para exclusão.");
      throw new AppError("Erro ao buscar cobrança para exclusão.", 500);
    }

    const { error: updateError } = await cobrancaRepository.update(id, { status: CobrancaStatus.CANCELADA });
    if (updateError) throw new AppError("Erro ao cancelar cobrança no banco de dados.", 500);

    const passageiroNomeDelete = (cobranca as Record<string, any>).passageiros?.nome || (cobranca as Record<string, any>).passageiro?.nome;
    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_EXCLUIDA,
      descricao: `Parcela de ${cobranca.mes}/${cobranca.ano} do passageiro ${passageiroNomeDelete} foi cancelada.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        backup: cobranca
      }
    });
  },

  async restaurarCobranca(id: string): Promise<any> {
    const { data: cobranca, error: fetchError } = await cobrancaRepository.getByIdBasic(id);

    if (fetchError || !cobranca) {
      logger.error({ error: fetchError?.message, cobrancaId: id }, "Erro ao buscar cobrança para restauração.");
      throw new AppError("Erro ao buscar cobrança para restauração.", 500);
    }

    if (cobranca.status !== CobrancaStatus.CANCELADA) {
      throw new AppError("Apenas cobranças canceladas podem ser reativadas.", 400);
    }

    const { data: updated, error: updateError } = await cobrancaRepository.update(id, {
      status: CobrancaStatus.PENDENTE,
      updated_at: new Date().toISOString()
    });

    if (updateError) throw new AppError("Erro ao reativar cobrança no banco de dados.", 500);

    const passageiroNomeRestore = (cobranca as Record<string, any>).passageiros?.nome || (cobranca as Record<string, any>).passageiro?.nome;
    historicoService.log({
      usuario_id: cobranca.usuario_id,
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: id,
      acao: AtividadeAcao.COBRANCA_CRIADA,
      descricao: `Parcela de ${cobranca.mes}/${cobranca.ano} do passageiro ${passageiroNomeRestore} foi reativada para pendente.`,
      meta: {
        valor: cobranca.valor,
        mes: cobranca.mes,
        ano: cobranca.ano,
        status: CobrancaStatus.PENDENTE
      }
    });

    return updated;
  },

  async listCobrancasWithFilters(filtros: Record<string, any>): Promise<any[]> {
    const hasPeriodoMesAno = Boolean(filtros.mes && filtros.ano && filtros.usuarioId);
    const repoFiltros = hasPeriodoMesAno ? { ...filtros, search: undefined } : filtros;

    const { data: cobrancasReais, error } = await cobrancaRepository.listWithFilters(repoFiltros);
    if (error) throw error;

    const listRealAtivas = (cobrancasReais || [])
      .filter((c: any) => c.status !== CobrancaStatus.CANCELADA)
      .map(_enrichCobrancaWithResponsavelPrincipal);

    if (!hasPeriodoMesAno || filtros.passageiroId || (filtros.status && filtros.status !== CobrancaStatus.PENDENTE)) {
      return _filterBySearchTerm(listRealAtivas, filtros.search);
    }

    const now = getNowBR();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetMonth = Number(filtros.mes);
    const targetYear = Number(filtros.ano);

    const isPastPeriod = targetYear < currentYear || (targetYear === currentYear && targetMonth < currentMonth);
    if (isPastPeriod) {
      return _filterBySearchTerm(listRealAtivas, filtros.search);
    }

    const { data: passageirosAtivos, error: passError } = await passageiroRepository.listAtivosParaProjecao(
      filtros.usuarioId,
      filtros.veiculoId
    );

    if (passError || !passageirosAtivos) {
      return _filterBySearchTerm(listRealAtivas, filtros.search);
    }

    const passageirosComCobranca = new Set((cobrancasReais || []).map((c: any) => c.passageiro_id));
    const projList: any[] = [];

    for (const p of passageirosAtivos) {
      if (passageirosComCobranca.has(p.id)) continue;
      if (!p.valor_cobranca || Number(p.valor_cobranca) <= 0) continue;

      const inicioStr = p.data_inicio_cobranca || p.created_at;
      const inicio = parseMonthYearFromDateString(inicioStr);
      if (inicio) {
        if (targetYear < inicio.year || (targetYear === inicio.year && targetMonth < inicio.month)) {
          continue;
        }
      }

      if (p.data_fim_cobranca) {
        const fim = parseMonthYearFromDateString(p.data_fim_cobranca);
        if (fim) {
          if (targetYear > fim.year || (targetYear === fim.year && targetMonth > fim.month)) {
            continue;
          }
        }
      }

      const dataVenc = getSafeDueDateString(p.dia_vencimento, targetMonth, targetYear);
      const enrichedPassageiro = _enrichCobrancaWithResponsavelPrincipal({ passageiro: p }).passageiro;

      projList.push({
        id: `proj_${p.id}_${targetMonth}_${targetYear}`,
        passageiro_id: p.id,
        usuario_id: filtros.usuarioId,
        mes: targetMonth,
        ano: targetYear,
        valor: Number(p.valor_cobranca),
        status: CobrancaStatus.PENDENTE,
        data_vencimento: dataVenc,
        isProjection: true,
        passageiro: enrichedPassageiro
      });
    }

    const combined = [...listRealAtivas, ...projList];
    return _filterBySearchTerm(combined, filtros.search);
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<any[]> {
    const { data, error } = await cobrancaRepository.listByPassageiro(passageiroId, ano);
    if (error) throw error;

    return (data || []).map(_enrichCobrancaWithResponsavelPrincipal);
  },



  async toggleNotificacoes(cobrancaId: string, novoStatus: boolean): Promise<boolean> {
    const { data, error } = await cobrancaRepository.toggleNotificacoes(cobrancaId, novoStatus);

    if (error) {
      logger.error({ error, cobrancaId }, "Erro ao alterar status de notificação da cobrança");
      throw new AppError("Erro ao alterar notificações.", 500);
    }

    // --- LOG DE AUDITORIA ---
    historicoService.log({
      usuario_id: data.usuario_id, // Precisamos garantir que usuario_id esteja disponível ou buscar
      entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
      entidade_id: cobrancaId,
      acao: AtividadeAcao.CONFIG_LEMBRETE,
      descricao: `Lembretes automáticos para esta parcela foram ${novoStatus ? 'DESATIVADOS' : 'REATIVADOS'}.`,
      meta: { desativar_lembretes: novoStatus }
    });

    return data.desativar_lembretes;
  },

  async gerarCobrancasMensaisParaMotorista(motoristaId: string, targetMonth: number, targetYear: number): Promise<{ created: number, skipped: number }> {
    let created = 0;
    let skipped = 0;

    // 1. Buscar Passageiros Ativos e Detalhes do Motorista
    const { data: motorista, error: motError } = await userRepository.getMotoristaId(motoristaId);

    if (motError) throw motError;

    const { data: passageiros, error: passError } = await passageiroRepository.listParaCobrancaAutomatica(motoristaId);

    if (passError) throw passError;
    if (!passageiros) return { created, skipped };

    const now = getNowBR();
    const isNextMonthWindow = now.getDate() >= 23;

    // Buscar as cobranças que já foram geradas neste mês/ano para este motorista
    const { data: cobrancasExistentes } = await cobrancaRepository.getByMesAnoParaMotorista(motoristaId, targetMonth, targetYear);
    const passageirosComCobranca = new Set(cobrancasExistentes?.map((c: any) => c.passageiro_id) || []);

    // 2. Iterar por Passageiro e Gerar Cobrança
    for (const passageiro of passageiros) {
      // Ignorar se for passageiro isento
      if (passageiro.isento === true) {
        skipped++;
        continue;
      }

      // Verificar se já existe cobrança para este mês/ano/passageiro
      if (passageirosComCobranca.has(passageiro.id)) {
        skipped++;
        continue;
      }

      // Repescagem (antes do dia 23): Ignora passageiros cadastrados neste mesmo mês
      if (!isNextMonthWindow && passageiro.created_at) {
        const passageiroCreatedAt = new Date(passageiro.created_at);
        const startOfCurrentMonth = new Date(targetYear, targetMonth - 1, 1);
        if (passageiroCreatedAt >= startOfCurrentMonth) {
          skipped++;
          continue;
        }
      }

      // Validar Período de Cobrança do Passageiro (timezone-safe)
      const targetDateNum = targetYear * 12 + (targetMonth - 1);

      const getYearMonth = (dateVal: any) => {
        if (!dateVal) return null;
        if (dateVal instanceof Date) {
          return { year: dateVal.getFullYear(), month: dateVal.getMonth() + 1 };
        }
        if (typeof dateVal === 'string') {
          const parts = dateVal.split("-").map(Number);
          if (parts.length >= 2) {
            return { year: parts[0], month: parts[1] };
          }
        }
        return null;
      };

      if (passageiro.data_inicio_cobranca) {
        const ym = getYearMonth(passageiro.data_inicio_cobranca);
        if (ym) {
          const inicioDateNum = ym.year * 12 + (ym.month - 1);
          if (targetDateNum < inicioDateNum) {
            skipped++;
            continue;
          }
        }
      }

      if (passageiro.data_fim_cobranca) {
        const ym = getYearMonth(passageiro.data_fim_cobranca);
        if (ym) {
          const fimDateNum = ym.year * 12 + (ym.month - 1);
          if (targetDateNum > fimDateNum) {
            skipped++;
            continue;
          }
        }
      }

      // Calcular Vencimento
      const dataVencimentoStr = getSafeDueDateString(passageiro.dia_vencimento, targetMonth, targetYear);

      const valorFinal = Number(passageiro.valor_cobranca);

      if (!valorFinal || valorFinal <= 0) continue;

      try {
        await this.createCobranca({
          usuario_id: motoristaId,
          passageiro_id: passageiro.id,
          valor: valorFinal,
          data_vencimento: dataVencimentoStr,
          mes: targetMonth,
          ano: targetYear
        }, { skipLog: true });

        created++;
      } catch (e: unknown) {
        logger.error({ error: e instanceof Error ? e.message : String(e), passageiroId: passageiro.id, motoristaId, mes: targetMonth, ano: targetYear }, "[CobrancaService] Erro ao gerar cobrança automática no loop");
      }
    }

    return { created, skipped };
  },

  async enviarNotificacoesDiarias() {
    logger.info("[CobrancaService] Iniciando processo diário de notificações de cobrança...");

    try {
      const now = getNowBR();
      const todayStr = toPersistenceString(now);

      const globalThresholdDays = await getConfigNumber(ConfigKey.PASSAGEIRO_DIAS_AVISO_VENCIMENTO, 2);

      const targetDates = [todayStr];

      // Dias futuros de 1 a 5 para cobrir qualquer preferência de motorista
      for (let adv = 1; adv <= 5; adv++) {
        const dAdv = getNowBR();
        dAdv.setDate(dAdv.getDate() + adv);
        targetDates.push(toPersistenceString(dAdv));
      }

      // Atrasos (Hoje - 3, Hoje - 5, Hoje - 7)
      const atrasos = [3, 5, 7];
      for (const dias of atrasos) {
        const d = getNowBR();
        d.setDate(d.getDate() - dias);
        targetDates.push(toPersistenceString(d));
      }

      const { data: cobrancas, error } = await cobrancaRepository.getPendentesParaNotificacao(targetDates);

      if (error) {
        logger.error({ error: error.message }, "[CobrancaService] Erro ao buscar cobranças pendentes para notificações");
        return;
      }

      if (!cobrancas || cobrancas.length === 0) {
        logger.info("[CobrancaService] Nenhuma cobrança pendente para notificar hoje.");
        return;
      }

      logger.info({ count: cobrancas.length }, "[CobrancaService] Processando notificações para cobranças pendentes...");

      let sentCount = 0;

      const BATCH_SIZE = 15;
      for (let i = 0; i < cobrancas.length; i += BATCH_SIZE) {
        const chunk = cobrancas.slice(i, i + BATCH_SIZE);
        const successfulIdsInChunk: string[] = [];

        const chunkPromises = chunk.map(async (c: any) => {
          const passageiro = c.passageiro;
          const motorista = c.motorista;

          const resp = _getResponsavelFromPassageiro(passageiro);
          if (!resp.telefone && !resp.email) return null;
          if (passageiro?.enviar_notificacoes === false) return null;

          const dataVencimentoStr = c.data_vencimento;
          const ultimaNotifStr = c.data_envio_ultima_notificacao;
          const lastNotifDateStr = ultimaNotifStr ? toPersistenceString(ultimaNotifStr) : null;

          if (lastNotifDateStr && lastNotifDateStr >= todayStr) {
            return null;
          }

          const motoristaConfig = Array.isArray(motorista?.usuario_configuracoes)
            ? motorista.usuario_configuracoes[0]
            : motorista?.usuario_configuracoes;

          const avisoPrevioAtivo = motoristaConfig?.cobranca_aviso_previo_ativo ?? true;
          const driverThresholdDays = Number(motoristaConfig?.cobranca_dias_aviso_previo) || globalThresholdDays;
          const vencimentoHojeAtivo = motoristaConfig?.cobranca_vencimento_hoje_ativo ?? true;
          const atraso3DiasAtivo = motoristaConfig?.cobranca_atraso_3_dias_ativo ?? true;
          const atraso5DiasAtivo = motoristaConfig?.cobranca_atraso_5_dias_ativo ?? true;
          const atraso7DiasAtivo = motoristaConfig?.cobranca_atraso_7_dias_ativo ?? true;

          let eventType:
            | typeof EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO
            | typeof EVENTO_PASSAGEIRO_VENCIMENTO_HOJE
            | typeof EVENTO_PASSAGEIRO_ATRASADO
            | null = null;
          let baseChannels: NotificationChannelEnum[] = [];
          let shouldSend = false;

          if (dataVencimentoStr > todayStr) {
            if (avisoPrevioAtivo) {
              const diasAntecedencia = diffInDays(todayStr, dataVencimentoStr);
              if (diasAntecedencia === driverThresholdDays) {
                eventType = EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO;
                baseChannels = [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND];
                shouldSend = true;
              }
            }
          } else if (dataVencimentoStr === todayStr) {
            if (vencimentoHojeAtivo) {
              eventType = EVENTO_PASSAGEIRO_VENCIMENTO_HOJE;
              baseChannels = [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND, NotificationChannelEnum.FIREBASE];
              shouldSend = true;
            }
          } else {
            const diasAtraso = diffInDays(dataVencimentoStr, todayStr);
            if (diasAtraso === 3 && atraso3DiasAtivo) {
              eventType = EVENTO_PASSAGEIRO_ATRASADO;
              baseChannels = [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND, NotificationChannelEnum.FIREBASE];
              shouldSend = true;
            } else if (diasAtraso === 5 && atraso5DiasAtivo) {
              eventType = EVENTO_PASSAGEIRO_ATRASADO;
              baseChannels = [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND];
              shouldSend = true;
            } else if (diasAtraso === 7 && atraso7DiasAtivo) {
              eventType = EVENTO_PASSAGEIRO_ATRASADO;
              baseChannels = [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND];
              shouldSend = true;
            }
          }

          if (!shouldSend || !eventType) return null;

          const activeChannels = baseChannels.filter((ch) => {
            if (ch === NotificationChannelEnum.RESEND) {
              return !!(resp.email && resp.email.trim());
            }
            if (ch === NotificationChannelEnum.WABA) {
              return !!(resp.telefone && resp.telefone.trim());
            }
            return true;
          });

          if (activeChannels.length === 0) return null;

          try {
            const diasAntecedencia = dataVencimentoStr > todayStr ? diffInDays(todayStr, dataVencimentoStr) : undefined;
            const context = {
              nomeResponsavel: resp.nome,
              nomePassageiro: passageiro.nome,
              nomeMotorista: getDriverDisplayName(motorista),
              apelidoMotorista: motorista.apelido,
              telefoneMotorista: motorista.telefone,
              valor: Number(c.valor),
              dataVencimento: dataVencimentoStr,
              diasAntecedencia,
              diasAtraso: eventType === EVENTO_PASSAGEIRO_ATRASADO ? diffInDays(dataVencimentoStr, todayStr) : undefined,
              usuarioId: c.usuario_id,
              passageiroId: passageiro.id,
              chavePix: motorista.chave_pix,
              tipoChavePix: motorista.tipo_chave_pix,
              mes: c.mes,
              ano: c.ano,
              cobrancaId: c.id
            };

            const success = await notificationService.notifyPassenger(
              resp.telefone || resp.email || "",
              eventType,
              context,
              {
                channels: activeChannels,
                usuarioId: c.usuario_id,
                passageiroId: passageiro.id,
                email: resp.email || undefined,
                metadata: { cobrancaId: c.id }
              }
            );

            if (success) {
              return c.id;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error({ err: msg, cobrancaId: c.id }, "[CobrancaService] Falha ao enviar notificação de cobrança individual");
          }

          return null;
        });

        const chunkOutcomes = await Promise.allSettled(chunkPromises);
        for (const outcome of chunkOutcomes) {
          if (outcome.status === "fulfilled" && outcome.value) {
            successfulIdsInChunk.push(outcome.value);
          }
        }

        if (successfulIdsInChunk.length > 0) {
          sentCount += successfulIdsInChunk.length;
          await cobrancaRepository.updateBulkUltimaNotificacao(successfulIdsInChunk, todayStr);
        }
      }

      logger.info({ sentCount }, "[CobrancaService] Envio diário de notificações de cobrança concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaService] Erro crítico no processo de notificações de cobrança");
    }
  },

  /**
   * Dispara a geração de cobranças para todos os motoristas ativos.
   * Foca no mês atual ou no próximo, dependendo da configuração.
   */
  async gerarCobrancasMensaisParaTodos() {
    logger.info("[CobrancaService] Iniciando geração global de cobranças...");

    // 1. Buscar todos os motoristas ativos (que não sejam admin)
    const { data: motoristas, error } = await userRepository.listMotoristasAtivos();

    if (error) throw error;
    if (!motoristas) return { totalMotoristas: 0 };

    const now = getNowBR();
    // Se hoje for dia >= 23, gera para o mês que vem. Se não, para o mês atual (repescagem segura).
    const targetMonth = now.getDate() >= 23 ? (now.getMonth() === 11 ? 1 : now.getMonth() + 2) : (now.getMonth() + 1);
    const targetYear = (now.getDate() >= 23 && now.getMonth() === 11) ? now.getFullYear() + 1 : now.getFullYear();

    for (const m of motoristas) {
      await addToGenerationQueue({
        motoristaId: m.id,
        mes: targetMonth,
        ano: targetYear
      });
    }

    return { totalMotoristas: motoristas.length, queued: true };
  },

  async processarResumoSemanalMotorista(
    motorista: { id: string; nome: string; telefone: string; email?: string } | string
  ): Promise<boolean> {
    let motoristaObj: { id: string; nome: string; telefone: string; email?: string } | null = null;

    if (typeof motorista === "string") {
      const { data: user } = await userRepository.getById(motorista);
      if (user) {
        motoristaObj = {
          id: user.id,
          nome: user.nome,
          telefone: user.telefone || "",
          email: user.email ?? undefined
        };
      }
    } else {
      motoristaObj = motorista;
    }

    if (!motoristaObj || !motoristaObj.telefone) {
      return false;
    }

    const now = getNowBR();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const dataRefStr = `${day}/${month}`;
    const hojeStr = toPersistenceString(now);

    const ontem = new Date(now);
    ontem.setDate(now.getDate() - 1);
    const ontemStr = toPersistenceString(ontem);

    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const primeiroDiaMesAnterior = new Date(prevYear, prevMonth, 1);
    const primeiroDiaMesAnteriorStr = toPersistenceString(primeiroDiaMesAnterior);

    const proximos7Dias = new Date(now);
    proximos7Dias.setDate(now.getDate() + 7);
    const proximos7DiasStr = toPersistenceString(proximos7Dias);

    const { data: cobrancasAtrasadas } = await cobrancaRepository.getCobrancasPendentesPorPeriodo(
      motoristaObj.id,
      primeiroDiaMesAnteriorStr,
      ontemStr
    );

    const { data: cobrancasProximos } = await cobrancaRepository.getCobrancasPendentesPorPeriodo(
      motoristaObj.id,
      hojeStr,
      proximos7DiasStr
    );

    const atrasadosList = (cobrancasAtrasadas || []).map((c: any) => {
      const passageiroInfo = c.passageiro as Record<string, any> | undefined;
      const diasAtraso = diffInDays(c.data_vencimento, now);

      let mesOrigemStr: string | undefined = undefined;
      if (c.mes !== (now.getMonth() + 1) || c.ano !== now.getFullYear()) {
        const nomeMes = getMonthNameBR(c.mes);
        mesOrigemStr = `${nomeMes}/${c.ano}`;
      }

      const respInfo = _getResponsavelFromPassageiro(passageiroInfo);
      return {
        passageiroNome: passageiroInfo?.nome || "Passageiro",
        responsavelNome: respInfo.nome,
        telefoneResponsavel: respInfo.telefone,
        valor: Number(c.valor) || 0,
        diasAtraso,
        mesOrigemStr
      };
    });

    atrasadosList.sort((a, b) => b.diasAtraso - a.diasAtraso);

    const proximosList = (cobrancasProximos || []).map((c: any) => {
      const passageiroInfo = c.passageiro as Record<string, any> | undefined;
      const respInfo = _getResponsavelFromPassageiro(passageiroInfo);
      const dt = parseLocalDate(c.data_vencimento);
      const diaSemanaStr = getShortWeekDayBR(dt);
      const dataVencimentoStr = `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;

      return {
        passageiroNome: passageiroInfo?.nome,
        responsavelNome: respInfo.nome,
        dataVencimentoStr,
        diaSemanaStr,
        valor: Number(c.valor) || 0
      };
    });

    if (atrasadosList.length === 0 && proximosList.length === 0) {
      return false;
    }

    const totalAtrasado = atrasadosList.reduce((acc, curr) => acc + curr.valor, 0);
    const totalProximos = proximosList.reduce((acc, curr) => acc + curr.valor, 0);

    await notificationService.notifyDriver(
      motoristaObj.telefone,
      EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
      {
        nomeMotorista: motoristaObj.nome,
        dataRefStr,
        cobrancasAtrasadasList: atrasadosList,
        cobrancasProximos7DiasList: proximosList,
        totalAtrasado,
        totalProximos,
        qtdAtrasados: atrasadosList.length,
        qtdProximos: proximosList.length
      },
      { channels: [NotificationChannelEnum.FIREBASE], usuarioId: motoristaObj.id, email: motoristaObj.email }
    );

    return true;
  },

  async enviarResumoSemanalMotoristas(): Promise<void> {
    logger.info("[CobrancaService] Iniciando envio do resumo semanal de cobrança para motoristas...");

    try {
      const { data: motoristas } = await userRepository.listMotoristasAtivosParaResumoCobranca();

      if (!motoristas || motoristas.length === 0) {
        logger.info("[CobrancaService] Nenhum motorista elegível para receber o resumo de cobrança hoje.");
        return;
      }

      let sentCount = 0;

      for (const m of motoristas) {
        try {
          const sent = await this.processarResumoSemanalMotorista(m);
          if (sent) sentCount++;
        } catch (notifErr: unknown) {
          const errorMsg = notifErr instanceof Error ? notifErr.message : String(notifErr);
          logger.error({ error: errorMsg, motoristaId: m.id }, "[CobrancaService] Erro ao enviar resumo de cobrança para motorista");
        }
      }

      logger.info({ sentCount }, "[CobrancaService] Processamento do resumo semanal de cobrança concluído.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "[CobrancaService] Erro no envio do resumo semanal de cobrança para motoristas");
    }
  }
};
