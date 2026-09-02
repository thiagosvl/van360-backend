import { supabaseAdmin } from "../../config/supabase.js";
import { SubscriptionStatus } from "../../types/enums.js";

export interface CalculatorBaselineDTO {
  motoristas: {
    total: number;
    ativos: number;
    mensal: number;
    anual: number;
    vitalicio: number;
    trial: number;
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
  };
  gateway: {
    pctPix: number;
    pctCartao: number;
    taxaPix: number;
    taxaCartao: number;
    impostoSimples: number;
  };
}

export class AdminCalculatorService {
  async getBaseline(): Promise<CalculatorBaselineDTO> {
    const [
      motoristasRes,
      assinaturasRes,
      passageirosRes,
      wabaRes,
      faturasRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id, ativo", { count: "exact" })
        .eq("tipo", "motorista"),

      supabaseAdmin
        .from("assinaturas")
        .select("id, usuario_id, status, data_vencimento, planos(nome)"),

      supabaseAdmin
        .from("passageiros")
        .select("id, usuario_id, ativo, isento, enviar_notificacoes"),

      supabaseAdmin
        .from("fila_notificacoes")
        .select("id", { count: "exact" })
        .eq("canal", "WABA")
        .eq("status", "SENT"),

      supabaseAdmin
        .from("assinatura_faturas")
        .select("id, metodo_pagamento, status")
        .eq("status", "pago"),
    ]);

    const totalMotoristas = motoristasRes.count ?? 0;
    const assinaturas = assinaturasRes.data || [];
    const passageiros = passageirosRes.data || [];
    const totalWaba = wabaRes.count ?? 0;
    const faturas = faturasRes.data || [];

    let mensal = 0;
    let anual = 0;
    let vitalicio = 0;
    let trial = 0;
    let ativos = 0;

    for (const sub of assinaturas) {
      if (sub.status === SubscriptionStatus.ACTIVE) {
        ativos++;
        if (!sub.data_vencimento) {
          vitalicio++;
        } else {
          const planoNome = (sub.planos as any)?.nome?.toLowerCase() || "";
          if (planoNome.includes("anual")) {
            anual++;
          } else {
            mensal++;
          }
        }
      } else if (sub.status === SubscriptionStatus.TRIAL) {
        trial++;
      }
    }

    const totalPassageiros = passageiros.length;
    const passageirosAtivos = passageiros.filter((p) => p.ativo).length;
    const passageirosPagantes = passageiros.filter((p) => p.ativo && !p.isento).length;
    const passageirosNotificaveis = passageiros.filter(
      (p) => p.ativo && !p.isento && (p.enviar_notificacoes === null || p.enviar_notificacoes === true)
    ).length;

    const motoristasComAlunos = new Set(passageiros.map((p) => p.usuario_id)).size || (ativos || 1);
    const mediaPorMotorista = motoristasComAlunos > 0
      ? Math.round(passageirosNotificaveis / motoristasComAlunos)
      : 65;

    let totalPix = 0;
    let totalCartao = 0;
    for (const f of faturas) {
      const metodo = (f.metodo_pagamento || "").toLowerCase();
      if (metodo.includes("pix")) {
        totalPix++;
      } else if (metodo.includes("cart") || metodo.includes("credit")) {
        totalCartao++;
      }
    }
    const totalPagos = totalPix + totalCartao;
    const pctPix = totalPagos > 0 ? Math.round((totalPix / totalPagos) * 100) : 50;
    const pctCartao = totalPagos > 0 ? 100 - pctPix : 50;

    const unitWabaUsd = 0.0068;
    const unitWabaBrl = 0.038;

    return {
      motoristas: {
        total: totalMotoristas,
        ativos: ativos || 4,
        mensal: mensal || 2,
        anual: anual || 2,
        vitalicio: vitalicio || 1,
        trial,
      },
      passageiros: {
        total: totalPassageiros,
        ativos: passageirosAtivos,
        pagantes: passageirosPagantes,
        notificaveis: passageirosNotificaveis || 259,
        mediaPorMotorista: mediaPorMotorista || 65,
      },
      waba: {
        totalMensagensMes: totalWaba || 74,
        custoEstimadoUsd: Number(((totalWaba || 74) * unitWabaUsd).toFixed(2)),
        custoEstimadoBrl: Number(((totalWaba || 74) * unitWabaBrl).toFixed(2)),
      },
      gateway: {
        pctPix,
        pctCartao,
        taxaPix: 1.19,
        taxaCartao: 3.49,
        impostoSimples: 6.0,
      },
    };
  }
}

export const adminCalculatorService = new AdminCalculatorService();
