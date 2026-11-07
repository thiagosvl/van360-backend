import { adminFinancialRepository } from "../../repositories/admin/admin-financial.repository.js";
import { adminDemographicsService } from "./admin-demographics.service.js";
import {
  calculateTrialCohorts,
  calculateProjectionsAndRenewals,
  formatMonthYearLabelBR,
  buildYearMonthKey,
  getYearMonthKeyBR,
  type FutureSettlingCardInvoice,
  type CohortDriverRecord,
  type ActiveSubRecord,
  type PlanRecord
} from "./admin-financial-projection.helper.js";
import { FINANCEIRO_CONFIG } from "../../config/constants.js";
import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  CheckoutPaymentMethod
} from "../../types/enums.js";
import {
  getNowBR,
  getEndOfDayBR,
  parseLocalDate,
  toPersistenceString,
  calcularDataLiquidacaoCartao
} from "../../utils/date.utils.js";
import type {
  AdminFinancialStatsResponseDTO,
  AdminDemographicsStatsResponseDTO,
  TrialsPipelineResponseDTO
} from "../../types/dtos/admin-financial.dto.js";

const DAYS_CARD_SETTLEMENT = FINANCEIRO_CONFIG.DIAS_RETENCAO_CARTAO;
const DEFAULT_MONTHLY_TICKET = 59.9;

export const adminFinancialService = {
  async getFinancialStats(): Promise<AdminFinancialStatsResponseDTO> {
    const [assinaturasAtivasRes, faturasPagasRes, _todasAssinaturasRes, planosRes, motoristasCohortRes] =
      await adminFinancialRepository.getFinancialRawData();

    const assinaturasRaw = (assinaturasAtivasRes.data || []) as ActiveSubRecord[];
    const faturasPagas = faturasPagasRes.data || [];
    const planos = (planosRes.data || []) as PlanRecord[];
    const todosMotoristasCadastrados = (motoristasCohortRes?.data || []) as CohortDriverRecord[];

    const now = getNowBR();
    const todayIso = toPersistenceString(now);
    const [currentYear, currentMonth1To12, diaAtual] = todayIso.split("-").map(Number);
    const currentMonthIndex0 = currentMonth1To12 - 1;
    const currentYearMonth = todayIso.slice(0, 7);

    const prevMonthDate = new Date(Date.UTC(currentYear, currentMonthIndex0 - 1, 1, 12, 0, 0));
    const prevYearMonth = buildYearMonthKey(prevMonthDate.getUTCFullYear(), prevMonthDate.getUTCMonth() + 1);
    const endOfDayNow = getEndOfDayBR(now);

    const planoMensalPadrao = planos.find((p) => p.identificador === SubscriptionIdentifer.MONTHLY);
    const ticketMensalReferencia = Number(
      planoMensalPadrao?.valor_promocional ?? planoMensalPadrao?.valor ?? DEFAULT_MONTHLY_TICKET
    );

    const planosMap = new Map<string, PlanRecord>();
    for (const p of planos) {
      planosMap.set(p.id, p);
    }

    const getSubscriptionPlan = (sub: ActiveSubRecord): PlanRecord | null | undefined => {
      if (sub.plano_id && planosMap.has(sub.plano_id)) {
        return planosMap.get(sub.plano_id)!;
      }
      return Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
    };

    let mrr = 0;
    let arr = 0;
    let totalMensais = 0;
    let totalAnuais = 0;
    let totalVitalicios = 0;
    let receitaRecorrenteMensalFixa = 0;
    let receitaContratadaAnual = 0;
    let trialsAtivosCount = 0;

    const assinantesPagantesAtivos: ActiveSubRecord[] = [];

    for (const sub of assinaturasRaw) {
      if (sub.status === SubscriptionStatus.TRIAL) {
        trialsAtivosCount++;
        continue;
      }
      if (sub.status !== SubscriptionStatus.ACTIVE && sub.status !== SubscriptionStatus.PAST_DUE) continue;

      const isVitalicio = !sub.data_vencimento;
      if (isVitalicio) {
        totalVitalicios++;
        continue;
      }

      const user = Array.isArray(sub.usuarios) ? sub.usuarios[0] : sub.usuarios;
      const email = (user?.email || "").toLowerCase();
      if (email.includes("teste-google")) continue;

      assinantesPagantesAtivos.push(sub);

      const plano = getSubscriptionPlan(sub);
      const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

      if (isYearly) {
        totalAnuais++;
        const valAnual = Number(
          sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        receitaContratadaAnual += valAnual;
        mrr += valAnual / 12;
        arr += valAnual;
      } else {
        totalMensais++;
        const valMensal = Number(
          sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        receitaRecorrenteMensalFixa += valMensal;
        mrr += valMensal;
        arr += valMensal * 12;
      }
    }

    const totalAssinantesAtivos = assinantesPagantesAtivos.length;

    let receitaRealizadaMes = 0;
    let receitaRealizadaMesAnterior = 0;
    let receitaCartaoLiquidarRestanteMesAtual = 0;

    let faturasPixCount = 0;
    let faturasPixTotal = 0;
    let faturasCartaoCount = 0;
    let faturasCartaoTotal = 0;
    let faturasOutrosCount = 0;
    let faturasOutrosTotal = 0;

    const futureSettlingPaidCardInvoices: FutureSettlingCardInvoice[] = [];
    const paidCardSubIdsCurrentMonth = new Set<string>();

    const historicoMesesMap = new Map<string, { chaveMes: string; labelMes: string; valor: number; quantidadeFaturas: number }>();
    for (let h = 5; h >= 0; h--) {
      const d = new Date(Date.UTC(currentYear, currentMonthIndex0 - h, 1, 12, 0, 0));
      const y = d.getUTCFullYear();
      const m0 = d.getUTCMonth();
      const k = buildYearMonthKey(y, m0 + 1);
      historicoMesesMap.set(k, {
        chaveMes: k,
        labelMes: formatMonthYearLabelBR(y, m0),
        valor: 0,
        quantidadeFaturas: 0
      });
    }

    for (const fatura of faturasPagas) {
      const dataRef = fatura.data_pagamento || fatura.created_at;
      if (!dataRef) continue;

      const dtPagamento = parseLocalDate(dataRef);
      const ymPagamento = getYearMonthKeyBR(dtPagamento);
      const isCartao = fatura.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const dtLiquidacao = isCartao
        ? calcularDataLiquidacaoCartao(dtPagamento, DAYS_CARD_SETTLEMENT)
        : dtPagamento;

      const ymLiquidacao = getYearMonthKeyBR(dtLiquidacao);
      const val = Number(fatura.valor) || 0;

      if (isCartao && ymPagamento === currentYearMonth && fatura.assinatura_id) {
        paidCardSubIdsCurrentMonth.add(String(fatura.assinatura_id));
      }

      const planoFatura = fatura.plano_id ? planosMap.get(fatura.plano_id) : undefined;
      const isYearlyFatura = planoFatura?.identificador === SubscriptionIdentifer.YEARLY || val >= 200;

      if (ymLiquidacao === currentYearMonth) {
        if (dtLiquidacao.getTime() <= endOfDayNow.getTime()) {
          receitaRealizadaMes += val;
        } else {
          receitaCartaoLiquidarRestanteMesAtual += val;
        }
      } else if (ymLiquidacao === prevYearMonth) {
        receitaRealizadaMesAnterior += val;
      } else if (ymLiquidacao > currentYearMonth && isCartao) {
        futureSettlingPaidCardInvoices.push({
          liquidacaoChave: ymLiquidacao,
          valor: val,
          isYearly: isYearlyFatura
        });
      }

      if (historicoMesesMap.has(ymLiquidacao)) {
        const item = historicoMesesMap.get(ymLiquidacao)!;
        item.valor = Math.round((item.valor + val) * 100) / 100;
        item.quantidadeFaturas += 1;
      }

      if (fatura.metodo_pagamento === CheckoutPaymentMethod.PIX) {
        faturasPixCount++;
        faturasPixTotal += val;
      } else if (isCartao) {
        faturasCartaoCount++;
        faturasCartaoTotal += val;
      } else {
        faturasOutrosCount++;
        faturasOutrosTotal += val;
      }
    }

    const totalFaturasCount = faturasPixCount + faturasCartaoCount + faturasOutrosCount;
    const totalFaturasTotal = faturasPixTotal + faturasCartaoTotal + faturasOutrosTotal;

    const meiosPagamento = {
      pix: {
        count: faturasPixCount,
        total: Math.round(faturasPixTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasPixCount / totalFaturasCount) * 100) : 0,
        pctValor: totalFaturasTotal > 0 ? Math.round((faturasPixTotal / totalFaturasTotal) * 100) : 0
      },
      cartao: {
        count: faturasCartaoCount,
        total: Math.round(faturasCartaoTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasCartaoCount / totalFaturasCount) * 100) : 0,
        pctValor: totalFaturasTotal > 0 ? Math.round((faturasCartaoTotal / totalFaturasTotal) * 100) : 0
      },
      outros: {
        count: faturasOutrosCount,
        total: Math.round(faturasOutrosTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasOutrosCount / totalFaturasCount) * 100) : 0,
        pctValor: totalFaturasTotal > 0 ? Math.round((faturasOutrosTotal / totalFaturasTotal) * 100) : 0
      }
    };

    let receitaRestanteMes = receitaCartaoLiquidarRestanteMesAtual;

    for (const sub of assinantesPagantesAtivos) {
      if (!sub.data_vencimento) continue;
      const vencYmd = toPersistenceString(sub.data_vencimento);
      const vencYearMonth = vencYmd.slice(0, 7);

      if (vencYmd > todayIso && vencYearMonth === currentYearMonth) {
        const isCartao = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
        const liqDate = isCartao
          ? calcularDataLiquidacaoCartao(vencYmd, DAYS_CARD_SETTLEMENT)
          : parseLocalDate(vencYmd);

        if (getYearMonthKeyBR(liqDate) === currentYearMonth) {
          const plano = getSubscriptionPlan(sub);
          const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;
          const val = isYearly
            ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
            : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);
          receitaRestanteMes += val;
        }
      }
    }
    const previsaoFechamentoMes = Math.round((receitaRealizadaMes + receitaRestanteMes) * 100) / 100;

    const {
      safrasTrials,
      totalTrialsConcluidosGeral,
      taxaConversaoTrial,
      trialsReceitaPotencial
    } = calculateTrialCohorts({
      todosMotoristasCadastrados,
      currentYear,
      currentMonthIndex0,
      trialsAtivosCount,
      ticketMensalReferencia
    });

    const {
      mesesProjecao,
      distribuicaoDiasMes,
      projecaoProximoMes,
      projecaoCaixaRealProximoMes,
      proximasRenovacoes
    } = calculateProjectionsAndRenewals({
      assinantesPagantesAtivos,
      futureSettlingPaidCardInvoices,
      paidCardSubIdsCurrentMonth,
      getSubscriptionPlan,
      currentYear,
      currentMonthIndex0,
      currentYearMonth,
      diaAtual,
      trialsReceitaPotencial,
      diasRetencaoCartao: DAYS_CARD_SETTLEMENT
    });

    return {
      kpis: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        receitaRealizadaMes: Math.round(receitaRealizadaMes * 100) / 100,
        receitaRealizadaMesAnterior: Math.round(receitaRealizadaMesAnterior * 100) / 100,
        previsaoFechamentoMes,
        totalAssinantesAtivos,
        totalMensais,
        totalAnuais,
        totalVitalicios,
        receitaRecorrenteMensalFixa: Math.round(receitaRecorrenteMensalFixa * 100) / 100,
        receitaContratadaAnual: Math.round(receitaContratadaAnual * 100) / 100,
        projecaoProximoMes,
        projecaoCaixaRealProximoMes,
        taxaConversaoTrial,
        trialsAtivosCount,
        trialsConcluidosCount: totalTrialsConcluidosGeral,
        trialsReceitaPotencial
      },
      projecao12Meses: mesesProjecao,
      distribuicaoDiasMes,
      meiosPagamento,
      proximasRenovacoes,
      safrasTrials,
      historicoReceitaMensal: Array.from(historicoMesesMap.values()),
      diasRetencaoCartao: DAYS_CARD_SETTLEMENT
    };
  },

  async getDemographicsStats(): Promise<AdminDemographicsStatsResponseDTO> {
    return adminDemographicsService.getDemographicsStats();
  },

  async getTrialsPipeline(): Promise<TrialsPipelineResponseDTO> {
    return adminDemographicsService.getTrialsPipeline();
  }
};
