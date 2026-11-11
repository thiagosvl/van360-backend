import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { logger } from "../config/logger.js";
import {
  createLocalDateBR,
  getNowBR,
  getSafeDueDateString,
  parseMonthYearFromDateString,
} from "../utils/date.utils.js";
import { CobrancaStatus } from "../types/enums.js";
import { CreateCobrancaDTO } from "../types/dtos/cobranca.dto.js";
import { addToGenerationQueue } from "../queues/generation.queue.js";
import {
  CreateCobrancaOptions,
  enrichCobrancaWithResponsavelPrincipal,
  filterCobrancasBySearchTerm,
} from "./cobranca-helpers.js";

export interface ListCobrancasFilterParams {
  usuarioId?: string;
  veiculoId?: string;
  passageiroId?: string;
  status?: string;
  dataInicio?: string;
  dataFim?: string;
  mes?: number | string;
  ano?: number | string;
  ano_letivo?: number | string;
  search?: string;
}

const getYearMonth = (dateVal: unknown): { year: number; month: number } | null => {
  if (!dateVal) return null;
  if (dateVal instanceof Date) {
    return { year: dateVal.getFullYear(), month: dateVal.getMonth() + 1 };
  }
  if (typeof dateVal === "string") {
    const parts = dateVal.split("-").map(Number);
    if (parts.length >= 2) {
      return { year: parts[0], month: parts[1] };
    }
  }
  return null;
};

export const cobrancaGeracaoService = {
  async listCobrancasWithFilters(filtros: ListCobrancasFilterParams): Promise<Array<Record<string, unknown>>> {
    const hasPeriodoMesAno = Boolean(filtros.mes && filtros.ano && filtros.usuarioId);
    const repoFiltros = hasPeriodoMesAno ? { ...filtros, search: undefined } : filtros;

    const { data: cobrancasReais, error } = await cobrancaRepository.listWithFilters(repoFiltros);
    if (error) throw error;

    const rawList = (cobrancasReais || []) as unknown as Array<Record<string, unknown>>;
    const listRealAtivas = rawList
      .filter((c) => c.status !== CobrancaStatus.CANCELADA)
      .map(enrichCobrancaWithResponsavelPrincipal);

    if (!hasPeriodoMesAno || filtros.passageiroId || (filtros.status && filtros.status !== CobrancaStatus.PENDENTE)) {
      return filterCobrancasBySearchTerm(listRealAtivas, filtros.search);
    }

    const now = getNowBR();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const targetMonth = Number(filtros.mes);
    const targetYear = Number(filtros.ano);

    const isPastPeriod = targetYear < currentYear || (targetYear === currentYear && targetMonth < currentMonth);
    if (isPastPeriod) {
      return filterCobrancasBySearchTerm(listRealAtivas, filtros.search);
    }

    const { data: passageirosAtivos, error: passError } = await passageiroRepository.listAtivosParaProjecao(
      String(filtros.usuarioId),
      filtros.veiculoId,
      targetMonth,
      targetYear
    );

    if (passError || !passageirosAtivos) {
      return filterCobrancasBySearchTerm(listRealAtivas, filtros.search);
    }

    const passageirosComCobranca = new Set(rawList.map((c) => String(c.passageiro_id)));
    const projList: Array<Record<string, unknown>> = [];

    for (const p of passageirosAtivos) {
      if (passageirosComCobranca.has(p.id)) continue;
      if (!p.valor_cobranca || Number(p.valor_cobranca) <= 0) continue;

      const dataVenc = getSafeDueDateString(p.dia_vencimento, targetMonth, targetYear);
      const enrichedPassageiro = enrichCobrancaWithResponsavelPrincipal({
        passageiro: p as unknown as Record<string, unknown>,
      }).passageiro;

      projList.push({
        id: `proj_${p.id}_${targetMonth}_${targetYear}`,
        passageiro_id: p.id,
        usuario_id: filtros.usuarioId,
        mes: targetMonth,
        ano: targetYear,
        ano_letivo: p.ano_letivo || targetYear,
        valor: Number(p.valor_cobranca),
        status: CobrancaStatus.PENDENTE,
        data_vencimento: dataVenc,
        isProjection: true,
        passageiro: enrichedPassageiro,
      });
    }

    const combined = [...listRealAtivas, ...projList];
    return filterCobrancasBySearchTerm(combined, filtros.search);
  },

  async listCobrancasByPassageiro(passageiroId: string, ano?: string): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await cobrancaRepository.listByPassageiro(passageiroId, ano);
    if (error) throw error;

    const rows = (data || []) as unknown as Array<Record<string, unknown>>;
    return rows.map(enrichCobrancaWithResponsavelPrincipal);
  },

  async gerarCobrancasMensaisParaMotorista(
    motoristaId: string,
    targetMonth: number,
    targetYear: number,
    createCobrancaFn: (data: CreateCobrancaDTO, options?: CreateCobrancaOptions) => Promise<unknown>
  ): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    const { error: motError } = await userRepository.getMotoristaId(motoristaId);
    if (motError) throw motError;

    const { data: passageiros, error: passError } = await passageiroRepository.listParaCobrancaAutomatica(
      motoristaId,
      targetMonth,
      targetYear
    );

    if (passError) throw passError;
    if (!passageiros) return { created, skipped };

    const now = getNowBR();
    const isNextMonthWindow = now.getDate() >= 23;

    const { data: cobrancasExistentes } = await cobrancaRepository.getByMesAnoParaMotorista(
      motoristaId,
      targetMonth,
      targetYear
    );
    const passageirosComCobranca = new Set((cobrancasExistentes || []).map((c) => c.passageiro_id));

    for (const passageiro of passageiros) {
      if (passageiro.isento === true || passageirosComCobranca.has(passageiro.id)) {
        skipped++;
        continue;
      }

      if (!isNextMonthWindow && passageiro.created_at) {
        const passageiroCreatedAt = new Date(passageiro.created_at);
        const startOfCurrentMonth = createLocalDateBR(targetYear, targetMonth, 1, 0, 0, 0, 0);
        if (passageiroCreatedAt >= startOfCurrentMonth) {
          skipped++;
          continue;
        }
      }

      const targetDateNum = targetYear * 12 + (targetMonth - 1);

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

      const dataVencimentoStr = getSafeDueDateString(passageiro.dia_vencimento, targetMonth, targetYear);
      const valorFinal = Number(passageiro.valor_cobranca);

      if (!valorFinal || valorFinal <= 0) continue;

      try {
        await createCobrancaFn(
          {
            usuario_id: motoristaId,
            passageiro_id: passageiro.id,
            valor: valorFinal,
            data_vencimento: dataVencimentoStr,
            mes: targetMonth,
            ano: targetYear,
            ano_letivo: passageiro.ano_letivo || targetYear,
          },
          { skipLog: true }
        );

        created++;
      } catch (e: unknown) {
        logger.error(
          {
            error: e instanceof Error ? e.message : String(e),
            passageiroId: passageiro.id,
            motoristaId,
            mes: targetMonth,
            ano: targetYear,
          },
          "[CobrancaGeracaoService] Erro ao gerar cobrança automática no loop"
        );
      }
    }

    if (created > 0) {
      const { authCacheService } = await import("./auth-cache.service.js");
      await authCacheService.invalidateUserResumo(motoristaId);
    }

    return { created, skipped };
  },

  async gerarCobrancasMensaisParaTodos(): Promise<{ totalMotoristas: number; queued?: boolean }> {
    logger.info("[CobrancaGeracaoService] Iniciando geração global de cobranças...");

    const { data: motoristas, error } = await userRepository.listMotoristasAtivos();
    if (error) throw error;
    if (!motoristas) return { totalMotoristas: 0 };

    const now = getNowBR();
    const targetMonth =
      now.getDate() >= 23 ? (now.getMonth() === 11 ? 1 : now.getMonth() + 2) : now.getMonth() + 1;
    const targetYear =
      now.getDate() >= 23 && now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();

    for (const m of motoristas) {
      await addToGenerationQueue({
        motoristaId: m.id,
        mes: targetMonth,
        ano: targetYear,
      });
    }

    return { totalMotoristas: motoristas.length, queued: true };
  },
};
