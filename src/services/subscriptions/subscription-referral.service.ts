import { NotificationChannelEnum } from '../../types/enums.js';
import { logger } from "../../config/logger.js";
import {
    SubscriptionStatus,
    IndicacaoStatus,
    ConfigKey,
    AtividadeEntidadeTipo,
    AtividadeAcao,
} from "../../types/enums.js";
import { getConfigNumber } from "../configuracao.service.js";
import { getNowBR, parseLocalDate, addDays, toPersistenceString } from "../../utils/date.utils.js";
import { env } from "../../config/env.js";
import { subscriptionService } from "./subscription.service.js";
import { referralRepository } from "../../repositories/referral.repository.js";
import { userRepository } from "../../repositories/user.repository.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { historicoService } from "../historico.service.js";
import { EVENTO_MOTORISTA_INDICACAO_BONUS, EVENTO_MOTORISTA_INDICACAO_CADASTRO } from "../../config/constants.js";

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

        const siteBase = (env.SITE_URL || "https://van360.com.br").replace(/\/+$/, "");

        return {
            total,
            completed,
            pending,
            referralCode: userId,
            referralLink: `${siteBase}/?ref=${userId}`,
            bonusDays,
            discountPct,
            hasActiveDiscount,
            hasIndicator
        };
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

        // Notificar motorista indicador sobre o novo cadastro
        try {
            const { data: indicador } = await userRepository.getById(indicadorId);
            if (indicador?.telefone) {
                const bonusDays = await getConfigNumber(ConfigKey.SAAS_REFERRAL_BONUS_DAYS, 30);
                await notificationService.notifyDriver(
                    indicador.telefone,
                    EVENTO_MOTORISTA_INDICACAO_CADASTRO,
                    {
                        nomeMotorista: indicador.nome,
                        trialDays: bonusDays
                    },
                    { channels: [NotificationChannelEnum.FIREBASE], usuarioId: indicadorId, email: indicador.email }
                ).catch(err => {
                    logger.error({ err, indicadorId }, "[SubscriptionReferralService] Erro ao notificar novo cadastro por indicação.");
                });
            }
        } catch (notifyErr) {
            logger.error({ notifyErr, indicadorId, indicadoId }, "[SubscriptionReferralService] Erro ao buscar indicador para notificação.");
        }
        
        return;
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

            const bonusDays = await getConfigNumber(ConfigKey.SAAS_REFERRAL_BONUS_DAYS, 30);
            const newExpiryDate = addDays(baseDate, bonusDays);
            const newExpiryStr = toPersistenceString(newExpiryDate);

            const shouldActivate = sub.status !== SubscriptionStatus.ACTIVE;
            await subscriptionRepository.applyReferralBonus(sub.id, newExpiryStr, shouldActivate);

            await historicoService.log({
                usuario_id: indicacao.indicador_id,
                entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
                entidade_id: sub.id,
                acao: AtividadeAcao.SAAS_REFERRAL_BONUS_RECEIVED,
                descricao: `Bônus de indicação aplicado (+${bonusDays} dias de assinatura).`
            });

            logger.info({ indicadorId: indicacao.indicador_id, dias: bonusDays, activated: shouldActivate }, "[SubscriptionReferralService] Bônus de indicação aplicado.");

            // Enviar notificação
            const { data: indicador } = await userRepository.getById(indicacao.indicador_id);
            if (indicador?.telefone) {
                await notificationService.notifyDriver(
                    indicador.telefone,
                    EVENTO_MOTORISTA_INDICACAO_BONUS,
                    {
                        nomeMotorista: indicador.nome,
                        trialDays: bonusDays,
                        dataVencimento: newExpiryStr
                    },
                    {
                        channels: [NotificationChannelEnum.FIREBASE],
                        usuarioId: indicador.id
                    }
                ).catch(err => {
                    logger.error({ err, indicadorId: indicador.id }, "[SubscriptionReferralService] Erro ao notificar bônus de indicação");
                });
            }
        }
    }
};
