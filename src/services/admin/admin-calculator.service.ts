import { supabaseAdmin } from "../../config/supabase.js";
import { SubscriptionStatus } from "../../types/enums.js";

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

interface UsuarioItem {
  id: string;
  nome: string | null;
  email: string | null;
  ativo: boolean | null;
}

interface AssinaturaItem {
  id: string;
  usuario_id: string;
  status: string | null;
  data_vencimento: string | null;
  planos: { nome: string | null } | null;
}

interface PassageiroItem {
  id: string;
  usuario_id: string;
  ativo: boolean | null;
  isento: boolean | null;
  enviar_notificacoes: boolean | null;
}

interface FaturaItem {
  id: string;
  metodo_pagamento: string | null;
  status: string | null;
  valor: number | null;
}

export class AdminCalculatorService {
  async getBaseline(): Promise<CalculatorBaselineDTO> {
    const [
      usuariosRes,
      assinaturasRes,
      passageirosRes,
      wabaRes,
      faturasRes,
    ] = await Promise.all([
      supabaseAdmin
        .from("usuarios")
        .select("id, nome, email, ativo")
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
        .select("id, metodo_pagamento, status, valor")
        .eq("status", "pago"),
    ]);

    const usuarios = (usuariosRes.data || []) as UsuarioItem[];
    const assinaturas = (assinaturasRes.data || []) as unknown as AssinaturaItem[];
    const passageiros = (passageirosRes.data || []) as PassageiroItem[];
    const totalWaba = wabaRes.count ?? 0;
    const faturas = (faturasRes.data || []) as FaturaItem[];

    const passageirosAtivosPorMotorista: Record<string, number> = {};
    for (const p of passageiros) {
      if (p.ativo) {
        passageirosAtivosPorMotorista[p.usuario_id] = (passageirosAtivosPorMotorista[p.usuario_id] || 0) + 1;
      }
    }

    const motoristasValidosMap = new Map<string, UsuarioItem>();
    for (const u of usuarios) {
      const email = (u.email || "").toLowerCase();
      const isInternalTest = email.includes("teste-google") || email.includes("@van360.com.br") || email.includes("thiago-svl");
      if (!isInternalTest && u.ativo) {
        motoristasValidosMap.set(u.id, u);
      }
    }

    let mensal = 0;
    let anual = 0;
    let vitalicio = 0;
    let trial = 0;
    let pagantes = 0;

    const motoristasOperacionaisAtivosIds = new Set<string>();

    for (const sub of assinaturas) {
      if (!motoristasValidosMap.has(sub.usuario_id)) continue;

      const qtdPassageiros = passageirosAtivosPorMotorista[sub.usuario_id] || 0;

      if (sub.status === SubscriptionStatus.ACTIVE) {
        if (!sub.data_vencimento) {
          if (qtdPassageiros >= 5) {
            vitalicio++;
            motoristasOperacionaisAtivosIds.add(sub.usuario_id);
          }
        } else {
          pagantes++;
          motoristasOperacionaisAtivosIds.add(sub.usuario_id);

          const planoNome = sub.planos?.nome?.toLowerCase() || "";
          if (planoNome.includes("anual")) {
            anual++;
          } else {
            mensal++;
          }
        }
      } else if (sub.status === SubscriptionStatus.TRIAL) {
        trial++;
        if (qtdPassageiros > 0) {
          motoristasOperacionaisAtivosIds.add(sub.usuario_id);
        }
      }
    }

    const totalMotoristasAtivos = pagantes + vitalicio;

    const anualRealDiluido = Number((anual * (250 / 12)).toFixed(2));
    const mensalReal = Number((mensal * 25).toFixed(2));
    const mrrReal = Number((anualRealDiluido + mensalReal).toFixed(2));
    const arrReal = Number((mrrReal * 12).toFixed(2));

    const passageirosValidos = passageiros.filter((p) => motoristasOperacionaisAtivosIds.has(p.usuario_id));
    const passageirosAtivos = passageirosValidos.filter((p) => p.ativo).length;
    const passageirosPagantes = passageirosValidos.filter((p) => p.ativo && !p.isento).length;
    const passageirosNotificaveis = passageirosValidos.filter(
      (p) => p.ativo && !p.isento && (p.enviar_notificacoes === null || p.enviar_notificacoes === true)
    ).length;

    const vansComBaseFormada = Array.from(motoristasOperacionaisAtivosIds).filter(
      (id) => (passageirosAtivosPorMotorista[id] || 0) >= 10
    );

    let somaPassageirosVansFormadas = 0;
    for (const id of vansComBaseFormada) {
      somaPassageirosVansFormadas += passageirosAtivosPorMotorista[id] || 0;
    }

    const mediaPorMotorista = vansComBaseFormada.length > 0
      ? Math.round(somaPassageirosVansFormadas / vansComBaseFormada.length)
      : (totalMotoristasAtivos > 0 ? Math.round(passageirosAtivos / totalMotoristasAtivos) : 66);

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
        total: motoristasValidosMap.size,
        ativos: totalMotoristasAtivos,
        pagantes,
        mensal,
        anual,
        vitalicio,
        trial,
      },
      receita: {
        mrrReal,
        arrReal,
        mensalReal,
        anualRealDiluido,
      },
      passageiros: {
        total: passageirosValidos.length,
        ativos: passageirosAtivos,
        pagantes: passageirosPagantes,
        notificaveis: passageirosNotificaveis,
        mediaPorMotorista,
      },
      waba: {
        totalMensagensMes: totalWaba,
        custoEstimadoUsd: Number((totalWaba * unitWabaUsd).toFixed(2)),
        custoEstimadoBrl: Number((totalWaba * unitWabaBrl).toFixed(2)),
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
