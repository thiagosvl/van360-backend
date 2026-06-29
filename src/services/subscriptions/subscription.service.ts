import { logger } from "../../config/logger.js";
import { getConfig } from "../configuracao.service.js";
import {
    SubscriptionStatus,
    SubscriptionIdentifer,
    AtividadeAcao,
    AtividadeEntidadeTipo,
    ConfigKey,
} from "../../types/enums.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, getEndOfDayBR, addDays, parseLocalDate } from "../../utils/date.utils.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_ASSINATURA_PAGO, EVENTO_ADMIN_NOVA_ASSINATURA, EVENTO_ADMIN_ASSINATURA_CANCELADA } from "../../config/constants.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { planRepository } from "../../repositories/plan.repository.js";
import { invoiceRepository } from "../../repositories/invoice.repository.js";
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
        const { data: plano } = await planRepository.getByIdentifier(SubscriptionIdentifer.MONTHLY);

        if (!plano) {
            logger.error({ identificador: SubscriptionIdentifer.MONTHLY }, "[SubscriptionService] Plano inicial não encontrado para criar Trial.");
            throw new Error(`Plano '${SubscriptionIdentifer.MONTHLY}' não encontrado.`);
        }

        const trialEndsAtIso = getEndOfDayBR(addDays(getNowBR(), 15)).toISOString();

        const isPromotionActive = await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false").then(v => v === "true");
        let valorPromocional = undefined;
        if (isPromotionActive && plano.valor_promocional !== null && plano.valor_promocional !== undefined) {
            valorPromocional = Number(plano.valor_promocional);
        }

        const { data, error } = await subscriptionRepository.createTrial(
            userId, 
            plano.id, 
            trialEndsAtIso, 
            Number(plano.valor),
            valorPromocional
        );

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
        const { data: plans, error } = await planRepository.listActivePlans();

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
            if (!sub.trial_ends_at) return false;
            const trialLimit = parseLocalDate(sub.trial_ends_at);
            if (isNaN(trialLimit.getTime())) return false;
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
     * Cancela a assinatura voluntariamente (Pelo App ou Admin)
     */
    async cancelSubscription(userId: string) {
        logger.info({ userId }, "[SubscriptionService] Cancelando assinatura do usuário...");

        const sub = await this.getOrCreateSubscription(userId);
        if (!sub) throw new Error("Assinatura não encontrada.");

        if (sub.status === SubscriptionStatus.CANCELED) {
            logger.info({ subId: sub.id }, "Assinatura já estava cancelada.");
            return true;
        }

        // 1. Atualizar status da assinatura
        await this.updateStatus(sub.id, SubscriptionStatus.CANCELED, "Assinatura cancelada manualmente.");

        // 2. Cancelar faturas pendentes/com erro
        await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString());

        // 3. Registrar no histórico
        await historicoService.log({
            usuario_id: userId,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
            entidade_id: sub.id,
            acao: AtividadeAcao.SAAS_ASSINATURA_CANCELADA,
            descricao: "A assinatura foi cancelada. As cobranças recorrentes foram suspensas."
        });

        // 4. Notificar Admin sobre o Churn (Cancelamento)
        try {
            const { userRepository } = await import("../../repositories/user.repository.js");
            const userRes = await userRepository.getById(userId);
            const user = userRes.data;
            if (user) {
                const planRes = sub.plan_id ? await planRepository.getById(sub.plan_id) : null;
                const plan = planRes ? planRes.data : null;
                await notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_CANCELADA, {
                    nomeMotorista: user.nome || "Desconhecido",
                    telefone: user.telefone || "Não informado",
                    nomePlano: plan ? plan.nome : "Desconhecido",
                    valor: plan ? `R$ ${typeof plan.valor === "string" ? parseFloat(plan.valor).toFixed(2).replace('.', ',') : plan.valor.toFixed(2).replace('.', ',')}` : "R$ 0,00",
                    dataVencimento: sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString("pt-BR") : "Desconhecida",
                    usuarioId: userId
                });
            }
        } catch (err) {
            logger.error({ err, userId }, "[SubscriptionService] Falha ao notificar admin sobre cancelamento de assinatura");
        }

        logger.info({ subId: sub.id, userId }, "[SubscriptionService] Assinatura cancelada com sucesso.");
        return true;
    },

    /**
     * Ativa a assinatura com base no pagamento de uma fatura.
     */
    async activateByFatura(faturaId: string) {
        const { data: rpcRes, error: rpcError } = await subscriptionRepository.confirmInvoicePaymentRpc(faturaId);

        if (rpcError) {
            logger.error({ error: rpcError, faturaId }, "[SubscriptionService] Erro ao executar RPC confirm_invoice_payment.");
            throw rpcError;
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
        
        const safeFaturaIdStr = res.fatura_id ? res.fatura_id.split("-")[0] : faturaId.split("-")[0];

        await historicoService.log({
            usuario_id: res.usuario_id!,
            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
            entidade_id: res.fatura_id || faturaId,
            acao: AtividadeAcao.SAAS_PAGAMENTO_RECEBIDO,
            descricao: `Pagamento confirmado para fatura ${safeFaturaIdStr} (Valor R$ ${res.valor})`
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
                planoNome: res.plano_nome,
            }).catch(err => logger.error({ err }, "[SubscriptionService] Falha ao notificar pagamento confirmado"));
        }

        // Notificação para o Admin (Telegram)
        const valorNumerico = typeof res.valor === "string" ? parseFloat(res.valor) : (res.valor || 0);
        notificationService.notifyAdmin(EVENTO_ADMIN_NOVA_ASSINATURA, {
            nomeMotorista: res.usuario_nome || "Desconhecido",
            telefone: res.usuario_telefone || "Não informado",
            nomePlano: res.plano_nome || "Desconhecido",
            valor: `R$ ${valorNumerico.toFixed(2).replace('.', ',')}`,
            dataVencimento: new Date(res.new_expiry!).toLocaleDateString('pt-BR'),
            usuarioId: res.usuario_id!
        }).catch(err => logger.error({ err: err instanceof Error ? err.message : String(err) }, "[SubscriptionService] Falha ao notificar admin sobre assinatura paga"));
    }
};
