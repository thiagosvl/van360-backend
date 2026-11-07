import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  CheckoutPaymentMethod
} from "../../types/enums.js";
import {
  parseLocalDate,
  toPersistenceString,
  getSafeDueDateString,
  calcularDataLiquidacaoCartao
} from "../../utils/date.utils.js";
import type {
  Projecao12MesesItemDTO,
  DistribuicaoDiaMesItemDTO,
  ProximaRenovacaoItemDTO,
  SafraTrialItemDTO
} from "../../types/dtos/admin-financial.dto.js";

export interface FutureSettlingCardInvoice {
  liquidacaoChave: string;
  valor: number;
  isYearly: boolean;
}

export interface PlanRecord {
  id: string;
  nome: string;
  identificador: string;
  valor: number;
  valor_promocional?: number | null;
}

export interface ActiveSubRecord {
  id: string;
  usuario_id: string;
  plano_id: string | null;
  status: string;
  metodo_pagamento?: string | null;
  data_vencimento: string | null;
  valor_base_mensal?: number | null;
  valor_promocional_mensal?: number | null;
  valor_base_anual?: number | null;
  valor_promocional_anual?: number | null;
  usuarios?: { nome?: string; email?: string; telefone?: string } | Array<{ nome?: string; email?: string; telefone?: string }> | null;
  planos?: PlanRecord | PlanRecord[] | null;
}

export interface CohortDriverRecord {
  id: string;
  created_at: string;
  assinaturas?: Array<{ id: string; status: string; data_vencimento?: string | null; trial_ends_at?: string | null }>;
}

export function formatMonthYearLabelBR(year: number, monthIndex0: number): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const m = months[monthIndex0];
  const y = String(year).slice(-2);
  return `${m}/${y}`;
}

export function buildYearMonthKey(year: number, month1To12: number): string {
  return `${year}-${String(month1To12).padStart(2, "0")}`;
}

export function getYearMonthKeyBR(date: Date | string): string {
  return toPersistenceString(date).slice(0, 7);
}

export function calculateTrialCohorts(params: {
  todosMotoristasCadastrados: CohortDriverRecord[];
  currentYear: number;
  currentMonthIndex0: number;
  trialsAtivosCount: number;
  ticketMensalReferencia: number;
}) {
  const {
    todosMotoristasCadastrados,
    currentYear,
    currentMonthIndex0,
    trialsAtivosCount,
    ticketMensalReferencia
  } = params;

  const safrasTrialsMap = new Map<string, SafraTrialItemDTO>();
  for (let j = 11; j >= 0; j--) {
    const d = new Date(Date.UTC(currentYear, currentMonthIndex0 - j, 1, 12, 0, 0));
    const y = d.getUTCFullYear();
    const m0 = d.getUTCMonth();
    const k = buildYearMonthKey(y, m0 + 1);
    safrasTrialsMap.set(k, {
      chaveMes: k,
      labelMes: formatMonthYearLabelBR(y, m0),
      novosTrials: 0,
      convertidos: 0,
      vitalicios: 0,
      expirados: 0,
      emAndamento: 0,
      taxaConversao: 0
    });
  }

  let totalTrialsConcluidosGeral = 0;
  let totalTrialsConvertidosGeral = 0;

  for (const u of todosMotoristasCadastrados) {
    if (!u.created_at) continue;
    const ym = getYearMonthKeyBR(u.created_at);

    const ass = Array.isArray(u.assinaturas) ? u.assinaturas[0] : u.assinaturas;
    const status = ass?.status;
    const hasVencimento = Boolean(ass?.data_vencimento);

    const isPag = status === SubscriptionStatus.ACTIVE && hasVencimento;
    const isVit = status === SubscriptionStatus.ACTIVE && !hasVencimento;
    const isEmTr = status === SubscriptionStatus.TRIAL;
    const isExp = status === SubscriptionStatus.EXPIRED || status === SubscriptionStatus.CANCELED;

    if (isPag) {
      totalTrialsConvertidosGeral++;
      totalTrialsConcluidosGeral++;
    } else if (isExp) {
      totalTrialsConcluidosGeral++;
    }

    if (safrasTrialsMap.has(ym)) {
      const item = safrasTrialsMap.get(ym)!;
      item.novosTrials++;
      if (isPag) item.convertidos++;
      else if (isVit) item.vitalicios++;
      else if (isEmTr) item.emAndamento++;
      else if (isExp) item.expirados++;
    }
  }

  for (const item of safrasTrialsMap.values()) {
    const concluidos = item.convertidos + item.expirados;
    item.taxaConversao = concluidos > 0 ? Math.round((item.convertidos / concluidos) * 1000) / 10 : 0;
  }

  const taxaConversaoTrial =
    totalTrialsConcluidosGeral > 0
      ? Math.round((totalTrialsConvertidosGeral / totalTrialsConcluidosGeral) * 1000) / 10
      : 0;

  const trialsReceitaPotencial =
    Math.round(trialsAtivosCount * (taxaConversaoTrial / 100) * ticketMensalReferencia * 100) / 100;

  return {
    safrasTrials: Array.from(safrasTrialsMap.values()),
    totalTrialsConcluidosGeral,
    taxaConversaoTrial,
    trialsReceitaPotencial
  };
}

export function calculateProjectionsAndRenewals(params: {
  assinantesPagantesAtivos: ActiveSubRecord[];
  futureSettlingPaidCardInvoices: FutureSettlingCardInvoice[];
  paidCardSubIdsCurrentMonth: Set<string>;
  getSubscriptionPlan: (sub: ActiveSubRecord) => PlanRecord | null | undefined;
  currentYear: number;
  currentMonthIndex0: number;
  currentYearMonth: string;
  diaAtual: number;
  trialsReceitaPotencial: number;
  diasRetencaoCartao: number;
}) {
  const {
    assinantesPagantesAtivos,
    futureSettlingPaidCardInvoices,
    paidCardSubIdsCurrentMonth,
    getSubscriptionPlan,
    currentYear,
    currentMonthIndex0,
    currentYearMonth,
    diaAtual,
    trialsReceitaPotencial,
    diasRetencaoCartao
  } = params;

  const diasMesMap = new Map<number, { valor: number; quantidade: number }>();
  for (let d = 1; d <= 31; d++) {
    diasMesMap.set(d, { valor: 0, quantidade: 0 });
  }

  const mesesProjecaoMap = new Map<
    string,
    Projecao12MesesItemDTO & { pixVenc: number; cartaoVenc: number; pixCaixa: number; cartaoCaixa: number }
  >();

  for (let i = 1; i <= 12; i++) {
    const projDate = new Date(Date.UTC(currentYear, currentMonthIndex0 + i, 1, 12, 0, 0));
    const y = projDate.getUTCFullYear();
    const m0 = projDate.getUTCMonth();
    const chaveMes = buildYearMonthKey(y, m0 + 1);
    const labelMes = formatMonthYearLabelBR(y, m0);
    const trialPotencialMes = i === 1 ? trialsReceitaPotencial : 0;

    mesesProjecaoMap.set(chaveMes, {
      chaveMes,
      labelMes,
      mensal: 0,
      anual: 0,
      mensalCaixa: 0,
      anualCaixa: 0,
      trialPotencial: Math.round(trialPotencialMes * 100) / 100,
      totalVencimento: 0,
      totalCaixaReal: 0,
      quantidadeRenovacoes: 0,
      pixVenc: 0,
      cartaoVenc: 0,
      pixCaixa: 0,
      cartaoCaixa: 0
    });
  }

  for (const paidCard of futureSettlingPaidCardInvoices) {
    const bucket = mesesProjecaoMap.get(paidCard.liquidacaoChave);
    if (bucket) {
      if (paidCard.isYearly) {
        bucket.anualCaixa += paidCard.valor;
      } else {
        bucket.mensalCaixa += paidCard.valor;
      }
      bucket.totalCaixaReal += paidCard.valor;
      bucket.cartaoCaixa += paidCard.valor;
    }
  }

  const proximasRenovacoes: ProximaRenovacaoItemDTO[] = [];

  for (const sub of assinantesPagantesAtivos) {
    if (!sub.data_vencimento) continue;

    const vencYmd = toPersistenceString(sub.data_vencimento);
    const [vencYear, vencMonth1To12, diaVenc] = vencYmd.split("-").map(Number);
    const vencYearMonth = vencYmd.slice(0, 7);
    const venc = parseLocalDate(sub.data_vencimento);

    const plano = getSubscriptionPlan(sub);
    const usuario = Array.isArray(sub.usuarios) ? sub.usuarios[0] : sub.usuarios;
    const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;
    const isCartao = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;

    const val = isYearly
      ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
      : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);

    if (!isYearly) {
      const currentEntry = diasMesMap.get(diaVenc) || { valor: 0, quantidade: 0 };
      currentEntry.valor += val;
      currentEntry.quantidade += 1;
      diasMesMap.set(diaVenc, currentEntry);
    }

    for (let i = 0; i <= 12; i++) {
      const cycleDate = new Date(Date.UTC(currentYear, currentMonthIndex0 + i, 1, 12, 0, 0));
      const cycleYear = cycleDate.getUTCFullYear();
      const cycleMonth = cycleDate.getUTCMonth() + 1;
      const cycleKey = buildYearMonthKey(cycleYear, cycleMonth);

      const monthsDiff = (cycleYear - vencYear) * 12 + (cycleMonth - vencMonth1To12);

      if (i === 0 && (vencYearMonth !== currentYearMonth || paidCardSubIdsCurrentMonth.has(sub.id))) {
        continue;
      }

      if (monthsDiff < 0 && vencYearMonth >= currentYearMonth) {
        continue;
      }

      if (isYearly && (monthsDiff < 0 || monthsDiff % 12 !== 0)) {
        continue;
      }

      const occurrenceIso = getSafeDueDateString(diaVenc, cycleMonth, cycleYear);
      const occurrenceDate = parseLocalDate(occurrenceIso);
      const liquidacaoDate = isCartao
        ? calcularDataLiquidacaoCartao(occurrenceDate, diasRetencaoCartao)
        : occurrenceDate;
      const liquidacaoKey = getYearMonthKeyBR(liquidacaoDate);

      const vencBucket = mesesProjecaoMap.get(cycleKey);
      if (vencBucket) {
        if (isYearly) {
          vencBucket.anual += val;
        } else {
          vencBucket.mensal += val;
        }
        vencBucket.quantidadeRenovacoes += 1;
        if (isCartao) {
          vencBucket.cartaoVenc += val;
        } else {
          vencBucket.pixVenc += val;
        }
      }

      const caixaBucket = mesesProjecaoMap.get(liquidacaoKey);
      if (caixaBucket) {
        if (isYearly) {
          caixaBucket.anualCaixa += val;
        } else {
          caixaBucket.mensalCaixa += val;
        }
        caixaBucket.totalCaixaReal += val;
        if (isCartao) {
          caixaBucket.cartaoCaixa += val;
        } else {
          caixaBucket.pixCaixa += val;
        }
      }
    }

    const liqDate = isCartao ? calcularDataLiquidacaoCartao(venc, diasRetencaoCartao) : venc;

    proximasRenovacoes.push({
      id: sub.id,
      usuarioId: sub.usuario_id,
      motoristaNome: usuario?.nome || "Motorista",
      motoristaTelefone: usuario?.telefone || "",
      planoNome: plano?.nome || (isYearly ? "Plano Anual" : "Plano Mensal"),
      tipoPlano: isYearly ? "YEARLY" : "MONTHLY",
      statusAssinatura: sub.status as SubscriptionStatus,
      isVitalicio: false,
      metodoPagamento: (sub.metodo_pagamento as CheckoutPaymentMethod) || null,
      dataVencimento: venc.toISOString(),
      dataLiquidacaoPrevista: liqDate.toISOString(),
      valor: Math.round(val * 100) / 100
    });
  }

  proximasRenovacoes.sort(
    (a, b) => new Date(a.dataVencimento || 0).getTime() - new Date(b.dataVencimento || 0).getTime()
  );

  const mesesProjecao: Projecao12MesesItemDTO[] = [];
  for (const b of mesesProjecaoMap.values()) {
    const totalVencimento = b.mensal + b.anual + b.trialPotencial;
    mesesProjecao.push({
      chaveMes: b.chaveMes,
      labelMes: b.labelMes,
      mensal: Math.round(b.mensal * 100) / 100,
      anual: Math.round(b.anual * 100) / 100,
      mensalCaixa: Math.round(b.mensalCaixa * 100) / 100,
      anualCaixa: Math.round(b.anualCaixa * 100) / 100,
      trialPotencial: b.trialPotencial,
      totalVencimento: Math.round(totalVencimento * 100) / 100,
      totalCaixaReal: Math.round(b.totalCaixaReal * 100) / 100,
      quantidadeRenovacoes: b.quantidadeRenovacoes
    });
  }

  const distribuicaoDiasMes: DistribuicaoDiaMesItemDTO[] = Array.from(diasMesMap.entries()).map(([dia, data]) => ({
    dia,
    valor: Math.round(data.valor * 100) / 100,
    quantidade: data.quantidade,
    isHoje: dia === diaAtual
  }));

  const firstMonthKey = mesesProjecao[0]?.chaveMes || "";
  const firstMonthBucket = mesesProjecaoMap.get(firstMonthKey);

  const projecaoProximoMes = {
    total: mesesProjecao[0]?.totalVencimento || 0,
    pix: Math.round((firstMonthBucket?.pixVenc || 0) * 100) / 100,
    cartao: Math.round((firstMonthBucket?.cartaoVenc || 0) * 100) / 100
  };

  const projecaoCaixaRealProximoMes = {
    total: mesesProjecao[0]?.totalCaixaReal || 0,
    pix: Math.round((firstMonthBucket?.pixCaixa || 0) * 100) / 100,
    cartao: Math.round((firstMonthBucket?.cartaoCaixa || 0) * 100) / 100
  };

  return {
    mesesProjecao,
    distribuicaoDiasMes,
    projecaoProximoMes,
    projecaoCaixaRealProximoMes,
    proximasRenovacoes
  };
}
