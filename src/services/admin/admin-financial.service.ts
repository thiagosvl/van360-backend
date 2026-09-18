import { adminFinancialRepository } from "../../repositories/admin/admin-financial.repository.js";
import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  CheckoutPaymentMethod,
  SubscriptionInvoiceStatus
} from "../../types/enums.js";
import { getNowBR, parseLocalDate, addDays } from "../../utils/date.utils.js";
import { extrairDddTelefone, obterEstadoPorDdd } from "../../utils/ddd-estado.util.js";
import type {
  AdminFinancialStatsResponseDTO,
  AdminDemographicsStatsResponseDTO,
  Projecao12MesesItemDTO,
  DistribuicaoDiaMesItemDTO,
  ProximaRenovacaoItemDTO,
  SafraTrialItemDTO,
  FaixaEtariaItemDTO,
  EvolucaoMensalUsuarioItemDTO,
  AdminEstadoDemographicsDTO
} from "../../types/dtos/admin-financial.dto.js";

const DAYS_CARD_SETTLEMENT = 21;
const DEFAULT_MONTHLY_TICKET = 59.9;

function formatMonthYearLabel(date: Date): string {
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const m = months[date.getMonth()];
  const y = String(date.getFullYear()).slice(-2);
  return `${m}/${y}`;
}

function getYearMonthKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export const adminFinancialService = {
  async getFinancialStats(): Promise<AdminFinancialStatsResponseDTO> {
    const [assinaturasAtivasRes, faturasPagasRes, todasAssinaturasRes, planosRes, motoristasCohortRes] =
      await adminFinancialRepository.getFinancialRawData();

    const assinaturasRaw = assinaturasAtivasRes.data || [];
    const faturasPagas = faturasPagasRes.data || [];
    const todasAssinaturas = todasAssinaturasRes.data || [];
    const planos = planosRes.data || [];
    const todosMotoristasCadastrados = (motoristasCohortRes?.data || []) as Array<{
      id: string;
      created_at: string;
      assinaturas?: Array<{ id: string; status: string; data_vencimento?: string | null; trial_ends_at?: string | null }>;
    }>;

    const now = getNowBR();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const planoMensalPadrao = planos.find((p) => p.identificador === SubscriptionIdentifer.MONTHLY);
    const ticketMensalReferencia = Number(
      planoMensalPadrao?.valor_promocional ?? planoMensalPadrao?.valor ?? DEFAULT_MONTHLY_TICKET
    );

    let mrr = 0;
    let arr = 0;
    let totalMensais = 0;
    let totalAnuais = 0;
    let totalVitalicios = 0;

    const assinantesPagantesAtivos: typeof assinaturasRaw = [];

    for (const sub of assinaturasRaw) {
      if (sub.status !== SubscriptionStatus.ACTIVE) continue;

      const isVitalicio = !sub.data_vencimento;
      if (isVitalicio) {
        totalVitalicios++;
        continue;
      }

      const user = Array.isArray(sub.usuarios) ? sub.usuarios[0] : sub.usuarios;
      const email = (user?.email || "").toLowerCase();
      if (email.includes("teste-google")) continue;

      assinantesPagantesAtivos.push(sub);

      const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
      const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

      if (isYearly) {
        totalAnuais++;
        const valAnual = Number(
          sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        mrr += valAnual / 12;
        arr += valAnual;
      } else {
        totalMensais++;
        const valMensal = Number(
          sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        mrr += valMensal;
        arr += valMensal * 12;
      }
    }

    const totalAssinantesAtivos = assinantesPagantesAtivos.length;

    const currentYearMonth = getYearMonthKey(now);
    const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
    const prevYearMonth = getYearMonthKey(prevMonthDate);

    let receitaRealizadaMes = 0;
    let receitaRealizadaMesAnterior = 0;

    let faturasPixCount = 0;
    let faturasPixTotal = 0;
    let faturasCartaoCount = 0;
    let faturasCartaoTotal = 0;
    let faturasOutrosCount = 0;
    let faturasOutrosTotal = 0;

    for (const fatura of faturasPagas) {
      const dataRef = fatura.data_pagamento || fatura.created_at;
      if (!dataRef) continue;

      const dt = parseLocalDate(dataRef);
      const ym = getYearMonthKey(dt);
      const val = Number(fatura.valor) || 0;

      if (ym === currentYearMonth) {
        receitaRealizadaMes += val;
      } else if (ym === prevYearMonth) {
        receitaRealizadaMesAnterior += val;
      }

      if (fatura.metodo_pagamento === CheckoutPaymentMethod.PIX) {
        faturasPixCount++;
        faturasPixTotal += val;
      } else if (fatura.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD) {
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

    let receitaRestanteMes = 0;
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    for (const sub of assinantesPagantesAtivos) {
      if (!sub.data_vencimento) continue;
      const vencDate = parseLocalDate(sub.data_vencimento);
      if (vencDate > now && vencDate <= endOfMonth) {
        const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
        const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;
        const val = isYearly
          ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
          : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);
        receitaRestanteMes += val;
      }
    }
    const previsaoFechamentoMes = Math.round((receitaRealizadaMes + receitaRestanteMes) * 100) / 100;

    let trialsAtivosCount = 0;
    for (const sub of assinaturasRaw) {
      if (sub.status === SubscriptionStatus.TRIAL) {
        trialsAtivosCount++;
      }
    }

    const safrasTrialsMap = new Map<string, SafraTrialItemDTO>();
    for (let j = 11; j >= 0; j--) {
      const d = new Date(currentYear, currentMonth - j, 1);
      const k = getYearMonthKey(d);
      safrasTrialsMap.set(k, {
        chaveMes: k,
        labelMes: formatMonthYearLabel(d),
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
      const cDate = parseLocalDate(u.created_at);
      const ym = getYearMonthKey(cDate);

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

    const mesesProjecao: Projecao12MesesItemDTO[] = [];
    const diasMesMap = new Map<number, { valor: number; quantidade: number }>();
    for (let d = 1; d <= 31; d++) {
      diasMesMap.set(d, { valor: 0, quantidade: 0 });
    }

    for (let i = 1; i <= 12; i++) {
      const projDate = new Date(currentYear, currentMonth + i, 1);
      const chaveMes = getYearMonthKey(projDate);
      const labelMes = formatMonthYearLabel(projDate);

      let totalMensal = 0;
      let totalAnual = 0;
      let totalMensalCaixa = 0;
      let totalAnualCaixa = 0;
      let totalCaixaReal = 0;
      let qtdRenovacoes = 0;

      for (const sub of assinantesPagantesAtivos) {
        if (!sub.data_vencimento) continue;

        const vencDate = parseLocalDate(sub.data_vencimento);
        const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
        const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;
        const diaVenc = vencDate.getDate();

        const isCartao = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
        const diasLiquidacao = isCartao ? DAYS_CARD_SETTLEMENT : 0;
        const liquidacaoDate = addDays(new Date(projDate.getFullYear(), projDate.getMonth(), diaVenc), diasLiquidacao);
        const liquidacaoChave = getYearMonthKey(liquidacaoDate);

        if (isYearly) {
          const monthsDiff =
            (projDate.getFullYear() - vencDate.getFullYear()) * 12 + (projDate.getMonth() - vencDate.getMonth());

          if (monthsDiff >= 0 && monthsDiff % 12 === 0) {
            const valAnual = Number(
              sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0
            );
            totalAnual += valAnual;
            qtdRenovacoes++;

            if (liquidacaoChave === chaveMes) {
              totalAnualCaixa += valAnual;
              totalCaixaReal += valAnual;
            }
          }
        } else {
          const valMensal = Number(
            sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0
          );
          totalMensal += valMensal;
          qtdRenovacoes++;

          if (liquidacaoChave === chaveMes) {
            totalMensalCaixa += valMensal;
            totalCaixaReal += valMensal;
          }

          if (i === 1) {
            const currentEntry = diasMesMap.get(diaVenc) || { valor: 0, quantidade: 0 };
            currentEntry.valor += valMensal;
            currentEntry.quantidade += 1;
            diasMesMap.set(diaVenc, currentEntry);
          }
        }
      }

      const trialPotencialMes = i === 1 ? trialsReceitaPotencial : 0;
      const totalVencimento = totalMensal + totalAnual + trialPotencialMes;

      mesesProjecao.push({
        chaveMes,
        labelMes,
        mensal: Math.round(totalMensal * 100) / 100,
        anual: Math.round(totalAnual * 100) / 100,
        mensalCaixa: Math.round(totalMensalCaixa * 100) / 100,
        anualCaixa: Math.round(totalAnualCaixa * 100) / 100,
        trialPotencial: Math.round(trialPotencialMes * 100) / 100,
        totalVencimento: Math.round(totalVencimento * 100) / 100,
        totalCaixaReal: Math.round(totalCaixaReal * 100) / 100,
        quantidadeRenovacoes: qtdRenovacoes
      });
    }

    const diaAtual = now.getDate();
    const distribuicaoDiasMes: DistribuicaoDiaMesItemDTO[] = Array.from(diasMesMap.entries()).map(([dia, data]) => ({
      dia,
      valor: Math.round(data.valor * 100) / 100,
      quantidade: data.quantidade,
      isHoje: dia === diaAtual
    }));

    const nextMonthProj = mesesProjecao[0] || {
      totalVencimento: 0,
      totalCaixaReal: 0,
      mensal: 0,
      anual: 0
    };

    let nextMonthPixVenc = 0;
    let nextMonthCartaoVenc = 0;
    let nextMonthPixCaixa = 0;
    let nextMonthCartaoCaixa = 0;

    const nextMonthIndex = (currentMonth + 1) % 12;
    const nextMonthYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const nextMonthKey = `${nextMonthYear}-${String(nextMonthIndex + 1).padStart(2, "0")}`;

    for (const sub of assinantesPagantesAtivos) {
      if (!sub.data_vencimento) continue;
      const vencDate = parseLocalDate(sub.data_vencimento);
      const diaVenc = vencDate.getDate();
      const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
      const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

      const val = isYearly
        ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
        : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);

      const isCartao = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const diasLiq = isCartao ? DAYS_CARD_SETTLEMENT : 0;
      const liqDate = addDays(new Date(nextMonthYear, nextMonthIndex, diaVenc), diasLiq);
      const liqKey = getYearMonthKey(liqDate);

      if (!isYearly) {
        if (isCartao) nextMonthCartaoVenc += val;
        else nextMonthPixVenc += val;

        if (liqKey === nextMonthKey) {
          if (isCartao) nextMonthCartaoCaixa += val;
          else nextMonthPixCaixa += val;
        }
      }
    }

    const projecaoProximoMes = {
      total: nextMonthProj.totalVencimento,
      pix: Math.round(nextMonthPixVenc * 100) / 100,
      cartao: Math.round(nextMonthCartaoVenc * 100) / 100
    };

    const projecaoCaixaRealProximoMes = {
      total: nextMonthProj.totalCaixaReal,
      pix: Math.round(nextMonthPixCaixa * 100) / 100,
      cartao: Math.round(nextMonthCartaoCaixa * 100) / 100
    };

    const proximasRenovacoes: ProximaRenovacaoItemDTO[] = [];

    for (const sub of assinantesPagantesAtivos) {
      if (!sub.data_vencimento) continue;

      const venc = parseLocalDate(sub.data_vencimento);
      const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
      const usuario = Array.isArray(sub.usuarios) ? sub.usuarios[0] : sub.usuarios;
      const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

      const val = isYearly
        ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
        : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);

      const isCartao = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const diasLiquidacao = isCartao ? DAYS_CARD_SETTLEMENT : 0;
      const liqDate = addDays(venc, diasLiquidacao);

      proximasRenovacoes.push({
        id: sub.id,
        usuarioId: sub.usuario_id,
        motoristaNome: usuario?.nome || "Motorista",
        motoristaTelefone: usuario?.telefone || "",
        planoNome: plano?.nome || (isYearly ? "Plano Anual" : "Plano Mensal"),
        tipoPlano: isYearly ? "YEARLY" : "MONTHLY",
        isVitalicio: false,
        metodoPagamento: (sub.metodo_pagamento as CheckoutPaymentMethod) || null,
        dataVencimento: venc.toISOString(),
        dataLiquidacaoPrevista: liqDate.toISOString(),
        valor: Math.round(val * 100) / 100
      });
    }

    proximasRenovacoes.sort((a, b) => new Date(a.dataVencimento || 0).getTime() - new Date(b.dataVencimento || 0).getTime());

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
      safrasTrials: Array.from(safrasTrialsMap.values()),
      diasRetencaoCartao: DAYS_CARD_SETTLEMENT
    };
  },

  async getDemographicsStats(): Promise<AdminDemographicsStatsResponseDTO> {
    const { data: usuarios } = await adminFinancialRepository.getDemographicsRawData();
    const motoristas = usuarios || [];

    const now = getNowBR();
    const currentYear = now.getFullYear();

    const ageBuckets = {
      "18-24": 0,
      "25-34": 0,
      "35-44": 0,
      "45-54": 0,
      "55-64": 0,
      "65+": 0,
      "Não informado": 0
    };

    let totalCadastrados = motoristas.length;
    let trialsIniciados = 0;
    let trialsAtivos = 0;
    let convertidosPagantes = 0;
    let assinantesAtivos = 0;
    let expiradosOuCancelados = 0;

    const ultimos6MesesMap = new Map<
      string,
      { chaveMes: string; labelMes: string; novosCadastros: number; novosAssinantes: number; cancelados: number }
    >();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, now.getMonth() - i, 1);
      const chave = getYearMonthKey(d);
      ultimos6MesesMap.set(chave, {
        chaveMes: chave,
        labelMes: formatMonthYearLabel(d),
        novosCadastros: 0,
        novosAssinantes: 0,
        cancelados: 0
      });
    }

    const estadosMap = new Map<string, { uf: string; nome: string; regiao: string; quantidade: number }>();

    for (const u of motoristas) {
      const ddd = extrairDddTelefone((u as any).telefone);
      const estadoInfo = obterEstadoPorDdd(ddd);
      const estadoAtual = estadosMap.get(estadoInfo.uf) || {
        uf: estadoInfo.uf,
        nome: estadoInfo.nome,
        regiao: estadoInfo.regiao,
        quantidade: 0,
      };
      estadoAtual.quantidade++;
      estadosMap.set(estadoInfo.uf, estadoAtual);

      if (u.data_nascimento) {
        const birthDate = parseLocalDate(u.data_nascimento);
        let age = currentYear - birthDate.getFullYear();
        const mDiff = now.getMonth() - birthDate.getMonth();
        if (mDiff < 0 || (mDiff === 0 && now.getDate() < birthDate.getDate())) {
          age--;
        }

        if (age >= 18 && age <= 24) ageBuckets["18-24"]++;
        else if (age >= 25 && age <= 34) ageBuckets["25-34"]++;
        else if (age >= 35 && age <= 44) ageBuckets["35-44"]++;
        else if (age >= 45 && age <= 54) ageBuckets["45-54"]++;
        else if (age >= 55 && age <= 64) ageBuckets["55-64"]++;
        else if (age >= 65) ageBuckets["65+"]++;
        else ageBuckets["Não informado"]++;
      } else {
        ageBuckets["Não informado"]++;
      }

      if (u.created_at) {
        const cDate = parseLocalDate(u.created_at);
        const ym = getYearMonthKey(cDate);
        if (ultimos6MesesMap.has(ym)) {
          const entry = ultimos6MesesMap.get(ym)!;
          entry.novosCadastros++;
        }
      }

      const assinaturas = Array.isArray(u.assinaturas) ? u.assinaturas : u.assinaturas ? [u.assinaturas] : [];
      if (assinaturas.length > 0) {
        trialsIniciados++;
        const sub = assinaturas[0] as {
          id: string;
          status: string;
          data_vencimento?: string | null;
          trial_ends_at?: string | null;
          updated_at?: string | null;
          created_at?: string | null;
        };

        const isPagante = sub.status === SubscriptionStatus.ACTIVE && Boolean(sub.data_vencimento);

        if (sub.status === SubscriptionStatus.TRIAL) {
          trialsAtivos++;
        }

        if (isPagante) {
          convertidosPagantes++;
          assinantesAtivos++;
          if (sub.created_at) {
            const ym = getYearMonthKey(parseLocalDate(sub.created_at));
            if (ultimos6MesesMap.has(ym)) {
              ultimos6MesesMap.get(ym)!.novosAssinantes++;
            }
          }
        } else if (sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.CANCELED) {
          expiradosOuCancelados++;
          const dataEvento = sub.status === SubscriptionStatus.EXPIRED
            ? sub.trial_ends_at || sub.updated_at || sub.created_at
            : sub.updated_at || sub.created_at;

          if (dataEvento) {
            const ym = getYearMonthKey(parseLocalDate(dataEvento));
            if (ultimos6MesesMap.has(ym)) {
              ultimos6MesesMap.get(ym)!.cancelados++;
            }
          }
        }
      }
    }

    const faixasEtarias: FaixaEtariaItemDTO[] = Object.entries(ageBuckets).map(([faixa, quantidade]) => ({
      faixa,
      quantidade,
      porcentagem: totalCadastrados > 0 ? Math.round((quantidade / totalCadastrados) * 1000) / 10 : 0
    }));

    const distribuicaoEstados: AdminEstadoDemographicsDTO[] = Array.from(estadosMap.values())
      .map((item) => ({
        uf: item.uf,
        nome: item.nome,
        regiao: item.regiao,
        quantidade: item.quantidade,
        porcentagem: totalCadastrados > 0 ? Math.round((item.quantidade / totalCadastrados) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.quantidade - a.quantidade);

    const taxaConversaoTrial =
      trialsIniciados > 0 ? Math.round((convertidosPagantes / trialsIniciados) * 1000) / 10 : 0;
    const taxaRetencaoAtiva =
      convertidosPagantes > 0 ? Math.round((assinantesAtivos / convertidosPagantes) * 1000) / 10 : 0;

    return {
      faixasEtarias,
      funil: {
        cadastrados: totalCadastrados,
        trialsIniciados,
        trialsAtivos,
        convertidosPagantes,
        assinantesAtivos,
        expiradosOuCancelados,
        taxaConversaoTrial,
        taxaRetencaoAtiva
      },
      evolucaoMensal: Array.from(ultimos6MesesMap.values()),
      distribuicaoEstados,
    };
  }
};
