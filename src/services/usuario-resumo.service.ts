import { supabaseAdmin } from "../config/supabase.js";
import { AssinaturaCobrancaStatus, CobrancaStatus, ConfigKey } from "../types/enums.js";
import { calculatePlanFlags } from "../utils/plan-flags.utils.js";
import { getConfigNumber } from "./configuracao.service.js";
import { planRules } from "./plan-rules.service.js";
import { getUsuarioData } from "./usuario.service.js";

interface SystemSummary {
  usuario: {
    ativo: boolean;
    plano: {
      slug: string;
      nome: string;
      status: string; // Subscription status (ativa, pendente, etc)
      trial_end_at?: string;
      limites: {

        franquia_cobranca_max: number;
        franquia_cobranca_restante: number;
      };
      funcionalidades: {
        cobranca_automatica: boolean;
        notificacoes_whatsapp: boolean;
      };
    };
    flags: {
      is_trial_ativo: boolean;
      is_trial_valido: boolean;
      dias_restantes_trial: number | null;
      dias_restantes_assinatura: number | null;
      trial_dias_total: number;

      ultima_fatura: AssinaturaCobrancaStatus | null;
      ultima_fatura_id: string | null;
      limite_franquia_atingido: boolean;
      pix_key_configurada: boolean;
      is_plano_valido: boolean;
      is_read_only: boolean;
      is_ativo: boolean;
      is_pendente: boolean;
      is_suspensa: boolean;
      is_cancelada: boolean;
      is_profissional: boolean;
      is_essencial: boolean;
    };
  };
  contadores: {
    passageiros: {
      total: number;
      ativos: number;
      inativos: number;
      com_automacao: number;
      solicitacoes_pendentes: number;
    };
    veiculos: {
      total: number;
      ativos: number;
      inativos: number;
    };
    escolas: {
      total: number;
      ativos: number;
      inativos: number;
    };
  };
  financeiro?: {
    receita: {
      realizada: number;
      prevista: number;
      pendente: number;
      taxa_recebimento: number;
    };
    saidas: {
      total: number;
      margem_operacional: number;
    };
    atrasos: {
      valor: number;
      count: number;
    };
    ticket_medio: number;
  };
}

export const usuarioResumoService = {
  getResumo: async (usuarioId: string, mes?: number, ano?: number): Promise<SystemSummary> => {
    // 1. Fetch User
    const usuario = await getUsuarioData(usuarioId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!usuario) throw new Error("Usuário não encontrado");

    // 2. Fetch Subscription & Plan
    const { data: assinaturaData, error: subError } = await supabaseAdmin
      .from("assinaturas_usuarios")
      .select(`
        *,
        planos:plano_id (
          *,
          parent:parent_id (*)
        )
      `)
      .eq("usuario_id", usuarioId)
      .eq("ativo", true) // Assuming we only care about the active one
      .maybeSingle();

    if (subError) throw subError;

    const planoBase = assinaturaData?.planos;
    const parentPlan = planoBase?.parent;
    const nomePlano = parentPlan ? parentPlan.nome : planoBase?.nome;
    const slugPlano = parentPlan ? parentPlan.slug : planoBase?.slug;

    // Determine features using Centralized Rules
    const funcionalidades = {
      cobranca_automatica: planRules.hasAutomatedBilling(slugPlano),
      notificacoes_whatsapp: planRules.hasWhatsAppNotifications(slugPlano),
    };

    // 3. Parallel Fetching for Counters & Status
    const [
      veiculosCount,
      escolasCount,
      whatsappStatusReq,
      passData, // Fetch full passenger data for granular status counting
      prePassageirosCount,
      trialDiasTotal,
    ] = await Promise.all([
      // Veiculos
      supabaseAdmin.from("veiculos").select("id, ativo", { count: "exact", head: false }).eq("usuario_id", usuarioId),
      
      // Escolas
      supabaseAdmin.from("escolas").select("id, ativo", { count: "exact", head: false }).eq("usuario_id", usuarioId),
      
      // Whatsapp (Always Connected/Global)
      Promise.resolve(null),
      
      // Passageiros (Native Select for filtering)
      supabaseAdmin.from("passageiros").select("id, ativo, enviar_cobranca_automatica").eq("usuario_id", usuarioId),

      // Pre-Passageiros (Solicitações)
      supabaseAdmin.from("pre_passageiros").select("id", { count: "exact", head: true }).eq("usuario_id", usuarioId),

      // Configuração Trial
      getConfigNumber(ConfigKey.TRIAL_DIAS_ESSENCIAL, 7)
    ]);

    // Process Counters
    // Passageiros
    const passageirosList = passData.data || [];
    const passTotal = passageirosList.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passAtivos = passageirosList.filter((p: any) => p.ativo).length;
    const passInativos = passTotal - passAtivos;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const passAuto = passageirosList.filter((p: any) => p.enviar_cobranca_automatica).length;

    // Veiculos
    const veicTotal = veiculosCount.data?.length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const veicAtivos = veiculosCount.data?.filter((v: any) => v.ativo).length || 0;
    const veicInativos = veicTotal - veicAtivos;

    // Escolas
    const escTotal = escolasCount.data?.length || 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const escAtivos = escolasCount.data?.filter((e: any) => e.ativo).length || 0;
    const escInativos = escTotal - escAtivos;

    // 4. Calculate Limits & Flags
    const franquiaContratada = assinaturaData?.franquia_contratada_cobrancas || 0;
    const franquiaRestante = Math.max(0, franquiaContratada - passAuto);

    // 5. Fetch Last Invoice Status
    const { data: lastInvoice } = await supabaseAdmin
      .from("assinaturas_cobrancas")
      .select("id, status")
      .eq("usuario_id", usuarioId)
      .order("data_vencimento", { ascending: false })
      .limit(1)
      .maybeSingle();

    const statusFatura = (lastInvoice?.status as AssinaturaCobrancaStatus) || null;




    // 6. Financial Summary (Default to current month if not specified)
    let financeiro: SystemSummary["financeiro"] = undefined;

    // Always calculate financials - default to current month if not specified
    const now = new Date();
    const targetMes = mes ?? (now.getMonth() + 1);
    const targetAno = ano ?? now.getFullYear();

    const start = new Date(targetAno, targetMes - 1, 1).toISOString().split("T")[0];
    const end = new Date(targetAno, targetMes, 0).toISOString().split("T")[0];

    const [cobrancasRes, gastosRes] = await Promise.all([
      supabaseAdmin
        .from("cobrancas")
        .select("*")
        .eq("usuario_id", usuarioId)
        .gte("data_vencimento", start)
        .lte("data_vencimento", end),
      supabaseAdmin
        .from("gastos")
        .select("*")
        .eq("usuario_id", usuarioId)
        .gte("data", start)
        .lte("data", end)
    ]);

    const cobrancas = cobrancasRes.data || [];
    const gastos = gastosRes.data || [];

    const cobrancasPagas = cobrancas.filter((c: any) => c.status === CobrancaStatus.PAGO);
    const cobrancasAbertas = cobrancas.filter((c: any) => c.status === CobrancaStatus.PENDENTE);

    const receitaRealizada = cobrancasPagas.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);
    const receitaPrevista = cobrancas.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);
    const taxaRecebimento = receitaPrevista > 0 ? (receitaRealizada / receitaPrevista) * 100 : 0;

    const totalDespesas = gastos.reduce((acc: number, g: any) => acc + Number(g.valor || 0), 0);
    const margemOperacional = receitaRealizada > 0 ? ((receitaRealizada - totalDespesas) / receitaRealizada) * 100 : 0;

    const hoje = new Date().toISOString().split("T")[0];
    const atrasos = cobrancasAbertas.filter((c: any) => c.data_vencimento < hoje);
    const valorAtrasos = atrasos.reduce((acc: number, c: any) => acc + Number(c.valor || 0), 0);

    const passageirosPagos = new Set(cobrancasPagas.map((c: any) => c.passageiro_id)).size;
    const ticketMedio = passageirosPagos > 0 ? receitaRealizada / passageirosPagos : 0;

    financeiro = {
      receita: {
        realizada: receitaRealizada,
        prevista: receitaPrevista,
        pendente: receitaPrevista - receitaRealizada,
        taxa_recebimento: Math.round(taxaRecebimento)
      },
      saidas: {
        total: totalDespesas,
        margem_operacional: Math.round(margemOperacional)
      },
      atrasos: {
        valor: valorAtrasos,
        count: atrasos.length
      },
      ticket_medio: ticketMedio
    };
    
    const flags = calculatePlanFlags(assinaturaData);

    return {
      usuario: {
        ativo: (usuario as any).ativo,
        plano: {
          slug: slugPlano,
          nome: nomePlano,
          status: assinaturaData?.status,
          trial_end_at: assinaturaData?.trial_end_at,
          limites: {
            franquia_cobranca_max: franquiaContratada,
            franquia_cobranca_restante: franquiaRestante
          },
          funcionalidades
        },
        flags: {
          ...flags,
          trial_dias_total: trialDiasTotal,

          ultima_fatura: statusFatura,
          ultima_fatura_id: lastInvoice?.id || null,
          limite_franquia_atingido: franquiaRestante <= 0 && planRules.canGeneratePix(slugPlano),
          pix_key_configurada: !!usuario.chave_pix,
        }
      },
      contadores: {
        passageiros: {
          total: passTotal,
          ativos: passAtivos,
          inativos: passInativos,
          com_automacao: passAuto,
          solicitacoes_pendentes: prePassageirosCount.count || 0
        },
        veiculos: {
          total: veicTotal,
          ativos: veicAtivos,
          inativos: veicInativos
        },
        escolas: {
          total: escTotal,
          ativos: escAtivos,
          inativos: escInativos
        }
      },
      financeiro
    };
  }
};
