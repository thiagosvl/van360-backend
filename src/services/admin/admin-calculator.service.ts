import { supabaseAdmin } from "../../config/supabase.js";
import {
  NotificationQueueStatus,
  NotificationChannelEnum,
} from "../../types/enums.js";
import { CUSTO_ESTIMADO_WABA_UNITARIO } from "../../config/constants.js";
import { adminFinancialService } from "./admin-financial.service.js";

export interface CalculatorBaselineDTO {
  motoristas: {
    total: number;
    ativos: number;
    pagantes: number;
    mensal: number;
    anual: number;
    vitalicio: number;
    trial: number;
  };
  receita: {
    mrrReal: number;
    arrReal: number;
    mensalReal: number;
    anualRealDiluido: number;
    anualTotalContratado: number;
  };
  passageiros: {
    total: number;
    ativos: number;
    pagantes: number;
    notificaveis: number;
    mediaPorMotorista: number;
  };
  waba: {
    totalMensagensMes: number;
    custoEstimadoUsd: number;
    custoEstimadoBrl: number;
    taxaAtrasoD3Pct: number;
  };
  gateway: {
    pctPix: number;
    pctCartao: number;
    taxaPix: number;
    taxaCartao: number;
    impostoSimples: number;
  };
  cobrancaAutomatica: {
    totalPagasMes: number;
    spreadUnitario: number;
    receitaEstimadaSpread: number;
  };
}

interface PassageiroItem {
  id: string;
  usuario_id: string;
  ativo: boolean | null;
  isento: boolean | null;
  enviar_notificacoes: boolean | null;
}

export class AdminCalculatorService {
  async getBaseline(): Promise<CalculatorBaselineDTO> {
    const [financialStats, passageirosRes, wabaSentRes, cobrancasAutoRes] = await Promise.all([
      adminFinancialService.getFinancialStats(),
      supabaseAdmin
        .from("passageiros")
        .select("id, usuario_id, ativo, isento, enviar_notificacoes"),
      supabaseAdmin
        .from("fila_notificacoes")
        .select("id", { count: "exact" })
        .eq("canal", NotificationChannelEnum.WABA)
        .eq("status", NotificationQueueStatus.SENT),
      supabaseAdmin
        .from("cobrancas")
        .select("id", { count: "exact" })
        .eq("status", "pago")
        .eq("pagamento_manual", false),
    ]);

    const kpis = financialStats.kpis;
    const passageiros = (passageirosRes.data || []) as PassageiroItem[];
    const passageirosAtivos = passageiros.filter((p) => p.ativo).length;
    const passageirosPagantes = passageiros.filter((p) => p.ativo && !p.isento).length;
    const passageirosNotificaveis = passageiros.filter(
      (p) => p.ativo && !p.isento && (p.enviar_notificacoes === null || p.enviar_notificacoes === true)
    ).length;

    const totalMotoristasAtivos = kpis.totalAssinantesAtivos + kpis.totalVitalicios;
    const mediaPorMotorista = totalMotoristasAtivos > 0
      ? Math.round(passageirosAtivos / totalMotoristasAtivos)
      : 46;

    const totalWaba = wabaSentRes.count ?? 0;
    const unitWabaUsd = 0.0068;
    const unitWabaBrl = CUSTO_ESTIMADO_WABA_UNITARIO;

    const totalCobrancasAutoPagas = cobrancasAutoRes.count ?? 0;
    const spreadUnitario = 0.65;
    const receitaEstimadaSpread = Number((totalCobrancasAutoPagas * spreadUnitario).toFixed(2));

    const pctPix = financialStats.meiosPagamento?.pix?.pct ?? 77;
    const pctCartao = financialStats.meiosPagamento?.cartao?.pct ?? 23;

    return {
      motoristas: {
        total: totalMotoristasAtivos + kpis.trialsAtivosCount,
        ativos: totalMotoristasAtivos,
        pagantes: kpis.totalAssinantesAtivos,
        mensal: kpis.totalMensais,
        anual: kpis.totalAnuais,
        vitalicio: kpis.totalVitalicios,
        trial: kpis.trialsAtivosCount,
      },
      receita: {
        mrrReal: kpis.mrr,
        arrReal: kpis.arr,
        mensalReal: kpis.receitaRecorrenteMensalFixa,
        anualRealDiluido: Number((kpis.receitaContratadaAnual / 12).toFixed(2)),
        anualTotalContratado: kpis.receitaContratadaAnual,
      },
      passageiros: {
        total: passageiros.length,
        ativos: passageirosAtivos,
        pagantes: passageirosPagantes,
        notificaveis: passageirosNotificaveis,
        mediaPorMotorista,
      },
      waba: {
        totalMensagensMes: totalWaba,
        custoEstimadoUsd: Number((totalWaba * unitWabaUsd).toFixed(2)),
        custoEstimadoBrl: Number((totalWaba * unitWabaBrl).toFixed(2)),
        taxaAtrasoD3Pct: 42.5,
      },
      gateway: {
        pctPix,
        pctCartao,
        taxaPix: 1.19,
        taxaCartao: 3.49,
        impostoSimples: 6.0,
      },
      cobrancaAutomatica: {
        totalPagasMes: totalCobrancasAutoPagas,
        spreadUnitario,
        receitaEstimadaSpread,
      },
    };
  }
}

export const adminCalculatorService = new AdminCalculatorService();
