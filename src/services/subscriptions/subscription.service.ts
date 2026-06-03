import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import {
    SubscriptionStatus,
    SubscriptionIdentifer,
    AtividadeAcao,
    AtividadeEntidadeTipo,
} from "../../types/enums.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, getEndOfDayBR, addDays, parseLocalDate } from "../../utils/date.utils.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_ASSINATURA_PAGO } from "../../config/constants.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { subscriptionReferralService } from "./subscription-referral.service.js";

export const subscriptionService = {

    /**
     * Busca a assinatura atual do motorista.
     * Se não existir, tenta criar um Trial inicial.
     */
    async getOrCreateSubscription(userId: string) {
        const { data, error } = await subscriptionRepository.getSubscriptionByUserId(userId);

        if (error) {
            logger.error({ error, userId }, "[SubscriptionService] Erro ao buscar assinatura.");
            return null;
        }

        if (!data) {
            return this.createTrial(userId);
        }

        return data;
    },

    /**
     * Cria um Trial de 15 dias para novos usuários.
     */
    async createTrial(userId: string) {
        const { data: plano } = await supabaseAdmin
            .from("planos")
            .select("id")
            .eq("identificador", SubscriptionIdentifer.MONTHLY)
            .single();

        if (!plano) {
            logger.error({ identificador: SubscriptionIdentifer.MONTHLY }, "[SubscriptionService] Plano inicial não encontrado para criar Trial.");
            return null;
        }

        const trialEndsAtIso = getEndOfDayBR(addDays(getNowBR(), 15)).toISOString();

        const { data, error } = await subscriptionRepository.createTrial(userId, plano.id, trialEndsAtIso);

        if (error) {
            logger.error({ error, userId }, "[SubscriptionService] Erro ao criar Trial.");
            return null;
        }

        logger.info({ userId, trialEndsAtIso }, "[SubscriptionService] Trial criado com sucesso.");

        await historicoService.log({
            usuario_id: userId,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
            entidade_id: data.id,
            acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
            descricao: "Trial de 15 dias iniciado para novo usuário."
        });

        return data;
    },

    /**
     * Lista todos os planos ativos.
     */
    async listPlans() {
        const { data: plans, error } = await supabaseAdmin
            .from("planos")
            .select("*")
            .eq("ativo", true)
            .order("valor", { ascending: true });

        if (error) throw error;
        return plans;
    },

    /**
     * Verifica se o motorista está bloqueado.
     */
    async isBlocked(userId: string): Promise<boolean> {
        const sub = await this.getOrCreateSubscription(userId);
        if (!sub) return true;

        if (
            sub.status === SubscriptionStatus.EXPIRED ||
            sub.status === SubscriptionStatus.CANCELED
        ) {
            return true;
        }

        if (sub.status === SubscriptionStatus.TRIAL) {
            const trialLimit = parseLocalDate(sub.trial_ends_at);
            return trialLimit < getNowBR();
        }

        return false;
    },

    /**
     * Atualiza o status e registra o motivo (opcional).
     */
    async updateStatus(id: string, status: SubscriptionStatus, motivo?: string) {
        logger.info({ subId: id, status, motivo }, "[SubscriptionService] Atualizando status de assinatura...");

        const { error } = await subscriptionRepository.updateStatus(id, status);

        if (error) {
            logger.error({ error, subId: id }, "[SubscriptionService] Erro ao atualizar status.");
            throw error;
        }

        return true;
    },

    /**
     * Ativa a assinatura com base no pagamento de uma fatura.
     */
    async activateByFatura(faturaId: string) {
        const { data: rpcRes, error: rpcError } = await supabaseAdmin
            .rpc("confirm_invoice_payment", { p_fatura_id: faturaId });

        if (rpcError) {
            logger.error({ error: rpcError, faturaId }, "[SubscriptionService] Erro ao executar RPC confirm_invoice_payment.");
            return;
        }

        const res = rpcRes as {
            success: boolean;
            message?: string;
            fatura_id?: string;
            assinatura_id?: string;
            usuario_id?: string;
            valor?: number | string;
            plano_nome?: string;
            new_expiry?: string;
            usuario_nome?: string;
            usuario_telefone?: string;
        };

        if (!res || !res.success) {
            logger.info({ faturaId, message: res?.message }, "[SubscriptionService] Webhook ignorado/cancelado.");
            return;
        }

        await historicoService.log({
            usuario_id: res.usuario_id!,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
            entidade_id: res.fatura_id!,
            acao: AtividadeAcao.SAAS_PAGAMENTO_RECEBIDO,
            descricao: `Pagamento confirmado para fatura ${res.fatura_id!.split("-")[0]} (Valor R$ ${res.valor})`
        });

        await historicoService.log({
            usuario_id: res.usuario_id!,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
            entidade_id: res.assinatura_id!,
            acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
            descricao: `Assinatura ativada via plano ${res.plano_nome} até ${new Date(res.new_expiry!).toLocaleDateString("pt-BR")}`
        });

        await subscriptionReferralService.completeReferral(res.usuario_id!, res.fatura_id!);

        if (res.usuario_telefone) {
            notificationService.notifyDriver(res.usuario_telefone, EVENTO_MOTORISTA_ASSINATURA_PAGO, {
                nomeMotorista: res.usuario_nome!,
                valor: typeof res.valor === "string" ? parseFloat(res.valor) : res.valor!,
                dataVencimento: res.new_expiry!,
            }).catch(err => logger.error({ err }, "[SubscriptionService] Falha ao notificar pagamento confirmado"));
        }
    }
};
