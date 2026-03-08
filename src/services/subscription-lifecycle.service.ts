import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AssinaturaStatus, AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { historicoService } from "./historico.service.js";

export const subscriptionLifecycleService = {


    async verificarLimiteAutomacao(usuarioId: string, quantidadeAAtivar: number = 1): Promise<void> {
        // 1. Buscar assinatura ativa
        const { data: assinaturas, error: assinaturaError } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select(`
                *,
                planos:plano_id (*, parent:parent_id (*))
            `)
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .limit(1)
            .single();

        if (assinaturaError || !assinaturas) {
            throw new Error("LIMIT_EXCEEDED_AUTOMATION: Cobrança automática requer plano Profissional ativo.");
        }

        const plano = assinaturas.planos as any;
        const slugPlano = plano?.parent?.slug || plano?.slug;

        // 2. Validar Plano
        // Importar PLANO_PROFISSIONAL se necessário ou usar string hardcoded se não quiser circular deps, mas melhor importar.
        // Assumindo que constants já está importado lá em cima (está).
        // @ts-ignore
        const { PLANO_PROFISSIONAL } = await import("../config/constants.js");

        if (slugPlano !== PLANO_PROFISSIONAL) {
            throw new Error("LIMIT_EXCEEDED_AUTOMATION: Cobrança automática requer plano Profissional.");
        }

        // 3. Validar Limite
        const franquiaContratada = assinaturas.franquia_contratada_cobrancas || 0;

        // Contar quantos passageiros JÁ têm cobranças automáticas ativas
        const { count: passageirosAtivosCount } = await supabaseAdmin
            .from("passageiros")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId)
            .eq("ativo", true)
            .eq("enviar_cobranca_automatica", true);

        const quantidadeJaAtiva = passageirosAtivosCount || 0;

        if (quantidadeJaAtiva + quantidadeAAtivar > franquiaContratada) {
             throw new Error("LIMIT_EXCEEDED_AUTOMATION");
        }
    },

    async suspenderAssinatura(assinaturaId: string, motivo: string): Promise<void> {
        // Buscar usuario_id antes
        const { data: sub } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select("usuario_id")
            .eq("id", assinaturaId)
            .single();

        const { error } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({ 
                status: AssinaturaStatus.SUSPENSA, 
                ativo: false,
                updated_at: new Date().toISOString()
            })
            .eq("id", assinaturaId);
            
        if (error) throw new Error(`Erro ao suspender assinatura: ${error.message}`);
        
        logger.info({ assinaturaId, motivo }, "Assinatura SUSPENSA via Lifecycle Service");

        if (sub) {
            historicoService.log({
                usuario_id: sub.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
                entidade_id: assinaturaId,
                acao: AtividadeAcao.USUARIO_SUSPENSO,
                descricao: `Assinatura suspensa: ${motivo}`,
                meta: { motivo }
            });
        }
    },

    async cancelarAssinaturaImediato(assinaturaId: string, motivo: string): Promise<void> {
        // Buscar usuario_id antes
        const { data: sub } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .select("usuario_id")
            .eq("id", assinaturaId)
            .single();

        const { error } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({ 
                status: AssinaturaStatus.CANCELADA, 
                ativo: false,
                updated_at: new Date().toISOString()
            })
            .eq("id", assinaturaId);

        if (error) throw new Error(`Erro ao cancelar assinatura imediatamente: ${error.message}`);
        
        logger.info({ assinaturaId, motivo }, "Assinatura CANCELADA (Imediata) via Lifecycle Service");

        if (sub) {
            historicoService.log({
                usuario_id: sub.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.ASSINATURA,
                entidade_id: assinaturaId,
                acao: AtividadeAcao.ASSINATURA_CANCELADA,
                descricao: `Assinatura cancelada imediatamente: ${motivo}`,
                meta: { motivo }
            });
        }
    },
    
    async inativarUsuarioPorAbandono(usuarioId: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ ativo: false })
            .eq("id", usuarioId);
            
        if (error) throw new Error(`Erro ao inativar usuário: ${error.message}`);
        
        logger.info({ usuarioId }, "Usuário INATIVADO por abandono via Lifecycle Service");

        historicoService.log({
            usuario_id: usuarioId,
            entidade_tipo: AtividadeEntidadeTipo.USUARIO,
            entidade_id: usuarioId,
            acao: AtividadeAcao.USUARIO_EXCLUIDO,
            descricao: `Conta inativada automaticamente por abandono (>30 dias suspenso).`,
            meta: { motivo: "abandono" }
        });
    }
};
