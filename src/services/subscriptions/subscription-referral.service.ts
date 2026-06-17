import { logger } from "../../config/logger.js";
import {
    SubscriptionStatus,
    IndicacaoStatus,
    ConfigKey,
} from "../../types/enums.js";
import { getConfigNumber } from "../configuracao.service.js";
import { getNowBR, parseLocalDate, getEndOfDayBR } from "../../utils/date.utils.js";
import { env } from "../../config/env.js";
import { subscriptionService } from "./subscription.service.js";
import { referralRepository } from "../../repositories/referral.repository.js";
import { userRepository } from "../../repositories/user.repository.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { EVENTO_MOTORISTA_INDICACAO_BONUS } from "../../config/constants.js";

export const subscriptionReferralService = {
    async getReferralSummary(userId: string) {
        const { data, error } = await referralRepository.getReferralsByIndicadorId(userId);

        if (error) throw error;

        const total = data?.length || 0;
        const completed = data?.filter(i => i.status === IndicacaoStatus.COMPLETED).length || 0;
        const pending = data?.filter(i => i.status === IndicacaoStatus.PENDING).length || 0;

        const bonusDays = await getConfigNumber(ConfigKey.SAAS_REFERRAL_BONUS_DAYS, 30);
        const discountPct = await getConfigNumber(ConfigKey.SAAS_REFERRAL_DISCOUNT_PCT, 10);

        const { data: indicacaoComoConvidado } = await referralRepository.getReferralByIndicadoId(userId);

        const hasActiveDiscount = indicacaoComoConvidado?.status === IndicacaoStatus.PENDING;
        const hasIndicator = !!indicacaoComoConvidado;

        return {
            total,
            completed,
            pending,
            referralCode: userId,
            referralLink: `${env.FRONTEND_URL}/cadastro?ref=${userId}`,
            bonusDays,
            discountPct,
            hasActiveDiscount,
            hasIndicator
        };
    },

    async claimReferral(userId: string, phone: string) {
        const cleanPhone = phone.replace(/\D/g, "");

        // 1. Verificar se o usuário está em Trial
        const { data: currentSub } = await subscriptionRepository.getSubscriptionStatus(userId);

        if (currentSub?.status !== SubscriptionStatus.TRIAL) {
            throw new Error("O resgate de convite só é permitido durante o período de Trial.");
        }

        // 2. Verificar se já possui indicação
        const { data: existingRef } = await referralRepository.getReferralByIndicadoId(userId);

        if (existingRef) {
            throw new Error("Você já possui um indicador vinculado.");
        }

        // 3. Buscar indicador
        const { data: indicador } = await userRepository.getByPhoneExcludingId(cleanPhone, userId);

        if (!indicador) {
            throw new Error("Motorista não encontrado com esse número.");
        }

        return this.registerReferral(indicador.id, userId);
    },

    async registerReferral(indicadorId: string, indicadoId: string): Promise<void> {
        const { error } = await referralRepository.createReferral({
            indicador_id: indicadorId,
            indicado_id: indicadoId,
            status: IndicacaoStatus.PENDING
        });

        if (error) {
            logger.error({ error, indicadorId, indicadoId }, "[SubscriptionReferralService] Erro ao registrar indicação.");
            throw error;
        }
    },

    async completeReferral(indicadoId: string, faturaId: string) {
        const { data: indicacao, error } = await referralRepository.completeReferral(indicadoId, faturaId);

        if (error || !indicacao) return;

        // 2. Aplicar bônus ao indicador
        const sub = await subscriptionService.getOrCreateSubscription(indicacao.indicador_id);
        if (sub) {
            let baseDate = getNowBR();
            if (sub.status === SubscriptionStatus.TRIAL && sub.trial_ends_at) {
                baseDate = parseLocalDate(sub.trial_ends_at);
            } else if (sub.data_vencimento) {
                baseDate = parseLocalDate(sub.data_vencimento);
            }

            if (baseDate < getNowBR()) {
                baseDate = getNowBR();
            }

            const newExpiry = getEndOfDayBR(baseDate);
            const bonusDays = await getConfigNumber(ConfigKey.SAAS_REFERRAL_BONUS_DAYS, 30);
            newExpiry.setDate(newExpiry.getDate() + bonusDays);

            const newExpiryIso = getEndOfDayBR(newExpiry).toISOString();

            if (sub.status === SubscriptionStatus.TRIAL) {
                await subscriptionRepository.extendTrial(sub.id, newExpiryIso);
            } else {
                await subscriptionRepository.updateExpiry(sub.id, newExpiryIso);
            }

            logger.info({ indicadorId: indicacao.indicador_id, dias: bonusDays }, "[SubscriptionReferralService] Bônus de indicação aplicado.");

            // Enviar notificação via WhatsApp
            const { data: indicador } = await userRepository.getById(indicacao.indicador_id);
            if (indicador?.telefone) {
                await notificationService.notifyDriver(
                    indicador.telefone,
                    EVENTO_MOTORISTA_INDICACAO_BONUS,
                    {
                        nomeMotorista: indicador.nome,
                        trialDays: bonusDays,
                        dataVencimento: getEndOfDayBR(newExpiry).toISOString()
                    }
                ).catch(err => {
                    logger.error({ err, indicadorId: indicador.id }, "[SubscriptionReferralService] Erro ao notificar bônus de indicação");
                });
            }
        }
    }
};
