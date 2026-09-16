import { adminFinancialRepository } from "../../repositories/admin/admin-financial.repository.js";
import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  CheckoutPaymentMethod,
  SubscriptionInvoiceStatus
} from "../../types/enums.js";
import { getNowBR, parseLocalDate, addDays } from "../../utils/date.utils.js";
import type {
  AdminFinancialStatsResponseDTO,
  AdminDemographicsStatsResponseDTO,
  Projecao12MesesItemDTO,
  DistribuicaoDiaMesItemDTO,
  ProximaRenovacaoItemDTO,
  FaixaEtariaItemDTO,
  EvolucaoMensalUsuarioItemDTO
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
    const [assinaturasAtivasRes, faturasPagasRes, todasAssinaturasRes, planosRes] =
      await adminFinancialRepository.getFinancialRawData();

    const assinaturasAtivas = assinaturasAtivasRes.data || [];
    const faturasPagas = faturasPagasRes.data || [];
    const todasAssinaturas = todasAssinaturasRes.data || [];
    const planos = planosRes.data || [];

    const now = getNowBR();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const planoMensalPadrao = planos.find((p) => p.identificador === SubscriptionIdentifer.MONTHLY);
    const ticketMensalReferencia = Number(
      planoMensalPadrao?.valor_promocional ?? planoMensalPadrao?.valor ?? DEFAULT_MONTHLY_TICKET
    );

    let mrr = 0;
    let arr = 0;

    for (const sub of assinaturasAtivas) {
      if (sub.status !== SubscriptionStatus.ACTIVE) continue;

      const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
      const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

      if (isYearly) {
        const valAnual = Number(
          sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        mrr += valAnual / 12;
        arr += valAnual;
      } else {
        const valMensal = Number(
          sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0
        );
        mrr += valMensal;
        arr += valMensal * 12;
      }
    }

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

      const metodo = (fatura.metodo_pagamento || "").toLowerCase();
      if (metodo.includes("pix")) {
        faturasPixCount++;
        faturasPixTotal += val;
      } else if (metodo.includes("cartao") || metodo.includes("credit")) {
        faturasCartaoCount++;
        faturasCartaoTotal += val;
      } else {
        faturasOutrosCount++;
        faturasOutrosTotal += val;
      }
    }

    const totalFaturasCount = faturasPixCount + faturasCartaoCount + faturasOutrosCount;
    const meiosPagamento = {
      pix: {
        count: faturasPixCount,
        total: Math.round(faturasPixTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasPixCount / totalFaturasCount) * 100) : 0
      },
      cartao: {
        count: faturasCartaoCount,
        total: Math.round(faturasCartaoTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasCartaoCount / totalFaturasCount) * 100) : 0
      },
      outros: {
        count: faturasOutrosCount,
        total: Math.round(faturasOutrosTotal * 100) / 100,
        pct: totalFaturasCount > 0 ? Math.round((faturasOutrosCount / totalFaturasCount) * 100) : 0
      }
    };

    const usuariosPagantesSet = new Set<string>();
    for (const fat of faturasPagas) {
      if (fat.status === SubscriptionInvoiceStatus.PAID) {
        // Encontramos via fatura ou status
      }
    }
    for (const sub of todasAssinaturas) {
      if (sub.status === SubscriptionStatus.ACTIVE) {
        usuariosPagantesSet.add(sub.usuario_id);
      }
    }

    const totalUsuariosComAssinatura = todasAssinaturas.length;
    const taxaConversaoTrial =
      totalUsuariosComAssinatura > 0
        ? Math.round((usuariosPagantesSet.size / totalUsuariosComAssinatura) * 1000) / 10
        : 0;

    let trialsAtivosCount = 0;
    for (const sub of assinaturasAtivas) {
      if (sub.status === SubscriptionStatus.TRIAL) {
        trialsAtivosCount++;
      }
    }
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
      let totalCaixaReal = 0;
      let qtdRenovacoes = 0;

      for (const sub of assinaturasAtivas) {
        if (sub.status !== SubscriptionStatus.ACTIVE || !sub.data_vencimento) continue;

        const vencDate = parseLocalDate(sub.data_vencimento);
        const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
        const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;
        const diaVenc = vencDate.getDate();

        const isCartao = (sub.metodo_pagamento || "").toLowerCase().includes("cartao");
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

    const pctPix = meiosPagamento.pix.pct / 100 || 0.7;
    const pctCartao = meiosPagamento.cartao.pct / 100 || 0.3;

    const projecaoProximoMes = {
      total: nextMonthProj.totalVencimento,
      pix: Math.round(nextMonthProj.totalVencimento * pctPix * 100) / 100,
      cartao: Math.round(nextMonthProj.totalVencimento * pctCartao * 100) / 100
    };

    const projecaoCaixaRealProximoMes = {
      total: nextMonthProj.totalCaixaReal,
      pix: Math.round(nextMonthProj.totalCaixaReal * pctPix * 100) / 100,
      cartao: Math.round(nextMonthProj.totalCaixaReal * pctCartao * 100) / 100
    };

    const limitNext30Days = addDays(now, 30);
    const proximasRenovacoes: ProximaRenovacaoItemDTO[] = [];

    for (const sub of assinaturasAtivas) {
      if (sub.status !== SubscriptionStatus.ACTIVE || !sub.data_vencimento) continue;

      const venc = parseLocalDate(sub.data_vencimento);
      if (venc >= now && venc <= limitNext30Days) {
        const plano = Array.isArray(sub.planos) ? sub.planos[0] : sub.planos;
        const usuario = Array.isArray(sub.usuarios) ? sub.usuarios[0] : sub.usuarios;
        const isYearly = plano?.identificador === SubscriptionIdentifer.YEARLY;

        const val = isYearly
          ? Number(sub.valor_promocional_anual ?? sub.valor_base_anual ?? plano?.valor_promocional ?? plano?.valor ?? 0)
          : Number(sub.valor_promocional_mensal ?? sub.valor_base_mensal ?? plano?.valor_promocional ?? plano?.valor ?? 0);

        const isCartao = (sub.metodo_pagamento || "").toLowerCase().includes("cartao");
        const diasLiquidacao = isCartao ? DAYS_CARD_SETTLEMENT : 0;
        const liqDate = addDays(venc, diasLiquidacao);

        proximasRenovacoes.push({
          id: sub.id,
          usuarioId: sub.usuario_id,
          motoristaNome: usuario?.nome || "Motorista",
          motoristaTelefone: usuario?.telefone || "",
          planoNome: plano?.nome || (isYearly ? "Plano Anual" : "Plano Mensal"),
          tipoPlano: isYearly ? "YEARLY" : "MONTHLY",
          metodoPagamento: sub.metodo_pagamento,
          dataVencimento: venc.toISOString(),
          dataLiquidacaoPrevista: liqDate.toISOString(),
          valor: Math.round(val * 100) / 100
        });
      }
    }

    proximasRenovacoes.sort((a, b) => new Date(a.dataVencimento).getTime() - new Date(b.dataVencimento).getTime());

    return {
      kpis: {
        mrr: Math.round(mrr * 100) / 100,
        arr: Math.round(arr * 100) / 100,
        receitaRealizadaMes: Math.round(receitaRealizadaMes * 100) / 100,
        receitaRealizadaMesAnterior: Math.round(receitaRealizadaMesAnterior * 100) / 100,
        projecaoProximoMes,
        projecaoCaixaRealProximoMes,
        taxaConversaoTrial,
        trialsAtivosCount,
        trialsReceitaPotencial
      },
      projecao12Meses: mesesProjecao,
      distribuicaoDiasMes,
      meiosPagamento,
      proximasRenovacoes: proximasRenovacoes.slice(0, 50),
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

    for (const u of motoristas) {
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
        const sub = assinaturas[0];

        if (sub.status === SubscriptionStatus.ACTIVE) {
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
          if (sub.created_at) {
            const ym = getYearMonthKey(parseLocalDate(sub.created_at));
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

    const taxaConversaoTrial =
      trialsIniciados > 0 ? Math.round((convertidosPagantes / trialsIniciados) * 1000) / 10 : 0;
    const taxaRetencaoAtiva =
      convertidosPagantes > 0 ? Math.round((assinantesAtivos / convertidosPagantes) * 1000) / 10 : 0;

    return {
      faixasEtarias,
      funil: {
        cadastrados: totalCadastrados,
        trialsIniciados,
        convertidosPagantes,
        assinantesAtivos,
        expiradosOuCancelados,
        taxaConversaoTrial,
        taxaRetencaoAtiva
      },
      evolucaoMensal: Array.from(ultimos6MesesMap.values())
    };
  }
};
