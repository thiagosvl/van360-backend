import { logger } from "../config/logger.js";
import { supabaseAdmin } from "../config/supabase.js";
import { AppError } from "../errors/AppError.js";
import { AssinaturaCobrancaStatus, AssinaturaStatus, ConfigKey } from "../types/enums.js";
import { cobrancaService } from "./cobranca.service.js";
import { getConfigNumber } from "./configuracao.service.js";
import { getAssinaturaAtiva } from "./subscription.common.js";

export const subscriptionLifecycleService = {
    async cancelarAssinatura({ usuarioId }: { usuarioId: string }): Promise<void> {
        const assinatura = await getAssinaturaAtiva(usuarioId);

        if (assinatura.cancelamento_manual) {
            throw new AppError("O cancelamento já foi agendado.", 400);
        }

        const { error } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({
                cancelamento_manual: new Date().toISOString(),
                status_anterior: assinatura.status,
                updated_at: new Date().toISOString()
            })
            .eq("id", assinatura.id);

        if (error) {
            logger.error({ error: error.message, usuarioId }, "Erro ao agendar cancelamento de assinatura");
            throw new Error("Erro ao processar cancelamento.");
        }

        logger.info({ usuarioId }, "Cancelamento de assinatura agendado com sucesso.");
    },

    async desistirCancelarAssinatura(usuarioId: string): Promise<boolean> {
        if (!usuarioId) {
            throw new AppError("ID do usuário é obrigatório para desfazer cancelamento.", 400);
        }

        try {
            const { data: assinaturaAtual, error: findAssinaturaError } = await supabaseAdmin
                .from("assinaturas_usuarios")
                .select("id, status, status_anterior")
                .eq("usuario_id", usuarioId)
                .not("cancelamento_manual", "is", null)
                .eq("ativo", true)
                .single();

            if (findAssinaturaError || !assinaturaAtual) {
                logger.warn({ usuarioId, error: findAssinaturaError?.message }, "Nenhuma assinatura ativa com cancelamento agendado encontrada.");
                return true;
            }

            // Reverter apenas cobranças de subscription canceladas
            await supabaseAdmin
                .from("assinaturas_cobrancas")
                .update({ status: AssinaturaCobrancaStatus.PENDENTE_PAGAMENTO })
                .eq("assinatura_usuario_id", assinaturaAtual.id)
                .eq("status", AssinaturaCobrancaStatus.CANCELADA)
                .eq("billing_type", "subscription")
                .is("data_pagamento", null);

            // Limpar campos de cancelamento agendado
            await supabaseAdmin
                .from("assinaturas_usuarios")
                .update({
                    cancelamento_manual: null,
                    status_anterior: null,
                    updated_at: new Date().toISOString()
                })
                .eq("id", assinaturaAtual.id);

            // THE RESURRECTION: Regenerar cobranças futuras se estivermos pós-data de geração
            try {
                const diaGeracao = await getConfigNumber(ConfigKey.DIA_GERACAO_MENSALIDADES, 25);
                const hoje = new Date();

                if (hoje.getDate() >= diaGeracao) {
                    logger.info({ usuarioId }, "Desistência de cancelamento tardia: Regenerando cobranças do próximo mês (Resurrection)...");

                    const nextMonthDate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
                    const targetMonth = nextMonthDate.getMonth() + 1;
                    const targetYear = nextMonthDate.getFullYear();

                    await cobrancaService.gerarCobrancasMensaisParaMotorista(
                        usuarioId,
                        targetMonth,
                        targetYear
                    );
                }
            } catch (resurrectionError: any) {
                logger.error({ error: resurrectionError.message, usuarioId }, "Erro ao regenerar cobranças na desistência do cancelamento.");
            }

            return true;

        } catch (err: any) {
            logger.error({ error: err.message, usuarioId }, "Falha ao desfazer cancelamento.");
            throw new Error(err.message || "Erro desconhecido ao desfazer cancelamento.");
        }
    },

    async verificarLimiteAutonacao(usuarioId: string, quantidadeAAtivar: number = 1): Promise<void> {
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
        const { error } = await supabaseAdmin
            .from("assinaturas_usuarios")
            .update({ 
                status: AssinaturaStatus.SUSPENSA, 
                ativo: false,
                updated_at: new Date().toISOString()
            })
            .eq("id", assinaturaId);
            
        if (error) throw new Error(`Erro ao suspender assinatura: ${error.message}`);
        
        // Log de auditoria ou ação adicional pode ser colocado aqui
        logger.info({ assinaturaId, motivo }, "Assinatura SUSPENSA via Lifecycle Service");
    },

    async cancelarAssinaturaImediato(assinaturaId: string, motivo: string): Promise<void> {
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
    },
    
    async inativarUsuarioPorAbandono(usuarioId: string): Promise<void> {
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ ativo: false })
            .eq("id", usuarioId);
            
        if (error) throw new Error(`Erro ao inativar usuário: ${error.message}`);
        
        logger.info({ usuarioId }, "Usuário INATIVADO por abandono via Lifecycle Service");
    }
};
