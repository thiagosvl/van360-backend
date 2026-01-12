import { WHATSAPP_STATUS } from "../config/constants.js";
import { supabaseAdmin } from "../config/supabase.js";
import { planRules } from "./plan-rules.service.js";
import { getUsuarioData } from "./usuario.service.js";
import { whatsappService } from "./whatsapp.service.js";

interface SystemSummary {
  usuario: {
    ativo: boolean;
    plano: {
      slug: string;
      nome: string;
      status: string; // Subscription status (ativa, pendente, etc)
      limites: {
        passageiros_max: number | null;
        passageiros_restantes: number | null;
        franquia_cobranca_max: number;
        franquia_cobranca_restante: number;
      };
      funcionalidades: {
        cobranca_automatica: boolean;
        notificacoes_whatsapp: boolean;
        relatorios_financeiros: boolean;
        gestao_gastos: boolean;
      };
    };
    flags: {
      is_trial_ativo: boolean;
      dias_restantes_trial: number;
      whatsapp_status: "connected" | "disconnected" | "qr_ready" | null;
      ultima_fatura: "pendente" | "vencida" | "paga" | "cancelada" | "nenhuma";
      limite_franquia_atingido: boolean;
      pix_key_configurada: boolean;
    };
  };
  contadores: {
    passageiros: {
      total: number;
      ativos: number;
      inativos: number;
      com_automacao: number;
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
}

export const usuarioResumoService = {
  getResumo: async (usuarioId: string): Promise<SystemSummary> => {
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
    const nomePlano = parentPlan ? parentPlan.nome : (planoBase?.nome || "Gratuito");
    const slugPlano = parentPlan ? parentPlan.slug : (planoBase?.slug || "gratuito");

    // Determine features using Centralized Rules
    const funcionalidades = {
      cobranca_automatica: planRules.hasAutomatedBilling(slugPlano),
      notificacoes_whatsapp: planRules.hasWhatsAppNotifications(slugPlano),
      relatorios_financeiros: planRules.hasFinancialReports(slugPlano),
      gestao_gastos: planRules.hasExpenseManagement(slugPlano),
    };

    // 3. Parallel Fetching for Counters & Status
    const [
      veiculosCount,
      escolasCount,
      whatsappStatusReq,
      passData, // Fetch full passenger data for granular status counting
    ] = await Promise.all([
      // Veiculos
      supabaseAdmin.from("veiculos").select("id, ativo", { count: "exact", head: false }).eq("usuario_id", usuarioId),
      
      // Escolas
      supabaseAdmin.from("escolas").select("id, ativo", { count: "exact", head: false }).eq("usuario_id", usuarioId),
      
      // Whatsapp (Only if allowed)
      funcionalidades.notificacoes_whatsapp ? whatsappService.getInstanceStatus(whatsappService.getInstanceName(usuarioId)) : Promise.resolve(null),
      
      // Passageiros (Native Select for filtering)
      supabaseAdmin.from("passageiros").select("id, ativo, enviar_cobranca_automatica").eq("usuario_id", usuarioId)
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

    const whatsappState = whatsappStatusReq 
      ? (whatsappStatusReq.state === WHATSAPP_STATUS.OPEN ? WHATSAPP_STATUS.CONNECTED : WHATSAPP_STATUS.DISCONNECTED) 
      : null;

    const isTrial = false; // TODO: Implement trial logic check
    
    return {
      usuario: {
        ativo: (usuario as any).ativo, // Using boolean as requested
        plano: {
          slug: slugPlano,
          nome: nomePlano,
          status: assinaturaData?.status,
          limites: {
            passageiros_max: null, // Unlimited for now based on logic
            passageiros_restantes: null, 
            franquia_cobranca_max: franquiaContratada,
            franquia_cobranca_restante: franquiaRestante
          },
          funcionalidades
        },
        flags: {
          is_trial_ativo: isTrial,
          dias_restantes_trial: 0,
          whatsapp_status: whatsappState as any,
          ultima_fatura: "nenhuma",
          limite_franquia_atingido: franquiaRestante <= 0 && planRules.canGeneratePix(slugPlano),
          pix_key_configurada: !!usuario.chave_pix
        }
      },
      contadores: {
        passageiros: {
          total: passTotal,
          ativos: passAtivos,
          inativos: passInativos,
          com_automacao: passAuto
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
      }
    };
  }
};
