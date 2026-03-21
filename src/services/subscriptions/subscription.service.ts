import { logger } from "../../config/logger.js";
import { SubscriptionStatus } from "../../types/enums.js";
import { SubscriptionTransition } from "../../types/subscription.js";

/**
 * SubscriptionService — Máquina de Estados de Assinatura SaaS (Skeleton)
 * 
 * ESTADO ATUAL: Desconectado. Nenhum serviço chama este módulo ainda.
 * Não existem tabelas de assinatura no banco. Quando existirem, este
 * serviço será conectado ao CronWorker para verificações diárias.
 *
 * REGRAS DE NEGÓCIO (imutáveis, independente do provider):
 * 
 *   TRIAL (criou conta)
 *     ↓ pagou → ACTIVE
 *     ↓ trial expirou → EXPIRED (bloqueia)
 * 
 *   ACTIVE (pagou)
 *     ↓ venceu hoje → PAST_DUE
 *     ↓ cancelou → CANCELED
 * 
 *   PAST_DUE (atrasado)
 *     ↓ pagou → ACTIVE
 *     ↓ X dias sem pagar → EXPIRED (bloqueia)
 * 
 *   EXPIRED (bloqueado)
 *     ↓ pagou → ACTIVE (reativa)
 * 
 * O BLOQUEIO impede cadastro/edição/remoção. Somente visualização.
 */

const VALID_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
    [SubscriptionStatus.TRIAL]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.ACTIVE]: [SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELED],
    [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE, SubscriptionStatus.EXPIRED],
    [SubscriptionStatus.CANCELED]: [SubscriptionStatus.ACTIVE],
    [SubscriptionStatus.EXPIRED]: [SubscriptionStatus.ACTIVE],
};

export const subscriptionService = {

    /**
     * Valida e executa uma transição de estado.
     * Garante que transições inválidas nunca aconteçam.
     */
    transition(currentStatus: SubscriptionStatus, targetStatus: SubscriptionStatus, reason: string): SubscriptionTransition | null {
        const allowed = VALID_TRANSITIONS[currentStatus] || [];

        if (!allowed.includes(targetStatus)) {
            logger.warn({ from: currentStatus, to: targetStatus, reason }, "[SubscriptionService] Transição de estado INVÁLIDA bloqueada.");
            return null;
        }

        const record: SubscriptionTransition = {
            from: currentStatus,
            to: targetStatus,
            reason,
            triggeredBy: "system",
            timestamp: new Date()
        };

        logger.info(record, "[SubscriptionService] Transição de estado executada.");
        return record;
    },

    /**
     * Verifica se o motorista está bloqueado (sem acesso a ações).
     * Usado por um middleware futuro para interceptar requests.
     */
    isBlocked(status: SubscriptionStatus): boolean {
        return status === SubscriptionStatus.EXPIRED;
    },

    /**
     * Verifica se o motorista está em Trial.
     */
    isTrial(status: SubscriptionStatus): boolean {
        return status === SubscriptionStatus.TRIAL;
    },

    /**
     * SKELETON: Verificação diária de assinaturas.
     * Será chamado pelo CronWorker quando as tabelas existirem.
     * 
     * Responsabilidades futuras:
     * 1. Buscar motoristas com trial expirando em X dias → notificar
     * 2. Buscar motoristas com assinatura vencendo em X dias → notificar
     * 3. Buscar motoristas com assinatura vencida hoje → marcar PAST_DUE
     * 4. Buscar motoristas em PAST_DUE há X dias → marcar EXPIRED (bloquear)
     */
    async runDailyCheck(): Promise<void> {
        logger.info("[SubscriptionService] runDailyCheck() chamado — SEM EFEITO (skeleton).");
    },

    /**
     * SKELETON: Processa um evento de pagamento normalizado.
     * Chamado pelo WebhookController após normalização.
     * 
     * Se pagou → ACTIVE (independente se veio de Asaas, EfiPay ou Stark Bank)
     */
    async handlePaymentEvent(_event: { type: string; internalId: string }): Promise<void> {
        logger.info({ event: _event }, "[SubscriptionService] handlePaymentEvent() — SEM EFEITO (skeleton).");
    }
};
