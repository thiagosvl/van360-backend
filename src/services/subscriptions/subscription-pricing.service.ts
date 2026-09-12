import { planRepository } from "../../repositories/plan.repository.js";
import { referralRepository } from "../../repositories/referral.repository.js";
import { subscriptionService } from "./subscription.service.js";
import { getConfig, getConfigNumber } from "../configuracao.service.js";
import { ConfigKey, SubscriptionIdentifer } from "../../types/enums.js";
import { parseLocalDate, getNowBR } from "../../utils/date.utils.js";
import {
    PlansResponseDTO,
    PlanPricingDTO,
    SaaSPlanWithPricingDTO,
    SubscriptionPricingSummaryDTO
} from "../../types/dtos/subscription.dto.js";

export const subscriptionPricingService = {
    async getPlansWithPricing(userId?: string): Promise<PlansResponseDTO> {
        const [plansResult, isPromotionActiveConfig] = await Promise.all([
            planRepository.listActivePlans(),
            getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false")
        ]);

        if (plansResult.error || !plansResult.data) {
            throw plansResult.error || new Error("Falha ao carregar planos do banco de dados.");
        }

        const isPromotionActive = isPromotionActiveConfig === "true";
        const plans = plansResult.data;

        const monthlyPlanRaw = plans.find(p => p.identificador === SubscriptionIdentifer.MONTHLY);
        const annualPlanRaw = plans.find(p => p.identificador === SubscriptionIdentifer.YEARLY);

        const baseMonthlyPrice = monthlyPlanRaw ? Number(monthlyPlanRaw.valor) : 0;
        const baseAnnualPrice = annualPlanRaw ? Number(annualPlanRaw.valor) : 0;

        let effectiveBaseMonthlyPrice = baseMonthlyPrice;
        let effectiveBaseAnnualPrice = baseAnnualPrice;

        let regularMonthlyPrice = isPromotionActive && monthlyPlanRaw?.valor_promocional
            ? Number(monthlyPlanRaw.valor_promocional)
            : baseMonthlyPrice;

        let regularAnnualPrice = isPromotionActive && annualPlanRaw?.valor_promocional
            ? Number(annualPlanRaw.valor_promocional)
            : baseAnnualPrice;

        let hasOverride = false;
        let hasReferralDiscount = false;
        let referralDiscountPct = 0;

        if (userId) {
            const [sub, pendingReferralResult, configDiscountPct] = await Promise.all([
                subscriptionService.getOrCreateSubscription(userId),
                referralRepository.getPendingReferralByIndicadoId(userId),
                getConfigNumber(ConfigKey.SAAS_REFERRAL_DISCOUNT_PCT, 10)
            ]);

            if (sub) {
                const nowTime = getNowBR().getTime();
                const isPromoValid = !sub.data_fim_promocao || parseLocalDate(sub.data_fim_promocao).getTime() >= nowTime;

                if (sub.valor_base_mensal !== null && sub.valor_base_mensal !== undefined) {
                    effectiveBaseMonthlyPrice = Number(sub.valor_base_mensal);
                    regularMonthlyPrice = effectiveBaseMonthlyPrice;
                    hasOverride = true;
                }

                if (sub.valor_promocional_mensal !== null && sub.valor_promocional_mensal !== undefined && isPromoValid) {
                    regularMonthlyPrice = Number(sub.valor_promocional_mensal);
                    hasOverride = true;
                }

                if (sub.valor_base_anual !== null && sub.valor_base_anual !== undefined) {
                    effectiveBaseAnnualPrice = Number(sub.valor_base_anual);
                    regularAnnualPrice = effectiveBaseAnnualPrice;
                    hasOverride = true;
                }

                if (sub.valor_promocional_anual !== null && sub.valor_promocional_anual !== undefined && isPromoValid) {
                    regularAnnualPrice = Number(sub.valor_promocional_anual);
                    hasOverride = true;
                }
            }

            if (pendingReferralResult?.data && configDiscountPct > 0) {
                hasReferralDiscount = true;
                referralDiscountPct = configDiscountPct;
            }
        }

        const monthlyDiscountAmount = hasReferralDiscount && referralDiscountPct > 0
            ? Number((regularMonthlyPrice * (referralDiscountPct / 100)).toFixed(2))
            : 0;

        const annualDiscountAmount = hasReferralDiscount && referralDiscountPct > 0
            ? Number((regularMonthlyPrice * (referralDiscountPct / 100)).toFixed(2))
            : 0;

        const finalMonthlyPrice = Math.max(0, Number((regularMonthlyPrice - monthlyDiscountAmount).toFixed(2)));
        const finalAnnualPrice = Math.max(0, Number((regularAnnualPrice - annualDiscountAmount).toFixed(2)));

        const annualMonthlyEquivalent = Number((finalAnnualPrice / 12).toFixed(2));
        const totalAnnualSavings = Number(((regularMonthlyPrice * 12) - finalAnnualPrice).toFixed(2));
        const freeMonths = 2;
        const discountPercent = regularMonthlyPrice > 0
            ? Math.round((totalAnnualSavings / (regularMonthlyPrice * 12)) * 100)
            : 0;

        const hasPromoMonthly = regularMonthlyPrice < effectiveBaseMonthlyPrice;
        const hasPromoAnnual = regularAnnualPrice < effectiveBaseAnnualPrice;

        const summary: SubscriptionPricingSummaryDTO = {
            monthlyPrice: finalMonthlyPrice,
            annualPrice: finalAnnualPrice,
            baseMonthlyPrice: effectiveBaseMonthlyPrice,
            baseAnnualPrice: effectiveBaseAnnualPrice,
            regularMonthlyPrice,
            regularAnnualPrice,
            annualMonthlyEquivalent,
            totalAnnualSavings,
            freeMonths,
            discountPercent,
            hasPromoMonthly,
            hasPromoAnnual,
            hasOverride,
            hasReferralDiscount,
            referralDiscountPct
        };

        const plansWithPricing: SaaSPlanWithPricingDTO[] = plans.map(p => {
            const isAnual = p.identificador === SubscriptionIdentifer.YEARLY;

            const pricing: PlanPricingDTO = isAnual ? {
                basePrice: effectiveBaseAnnualPrice,
                regularPrice: regularAnnualPrice,
                finalPrice: finalAnnualPrice,
                monthlyEquivalent: annualMonthlyEquivalent,
                totalAnnualSavings,
                freeMonths,
                discountPercent,
                hasPromo: hasPromoAnnual,
                hasOverride,
                hasReferralDiscount,
                referralDiscountPct,
                referralDiscountAmount: annualDiscountAmount
            } : {
                basePrice: effectiveBaseMonthlyPrice,
                regularPrice: regularMonthlyPrice,
                finalPrice: finalMonthlyPrice,
                monthlyEquivalent: finalMonthlyPrice,
                totalAnnualSavings: 0,
                freeMonths: 0,
                discountPercent: 0,
                hasPromo: hasPromoMonthly,
                hasOverride,
                hasReferralDiscount,
                referralDiscountPct,
                referralDiscountAmount: monthlyDiscountAmount
            };

            return {
                id: p.id,
                nome: p.nome,
                identificador: p.identificador,
                valor: Number(p.valor),
                valor_promocional: p.valor_promocional !== null ? Number(p.valor_promocional) : null,
                ativo: Boolean(p.ativo),
                pricing
            };
        });

        return {
            plans: plansWithPricing,
            isPromotionActive,
            pricingSummary: summary
        };
    },

    async calculatePlanPrice(userId: string, planIdentifier: string): Promise<number> {
        const { plans } = await this.getPlansWithPricing(userId);
        const targetPlan = plans.find(p => p.identificador === planIdentifier);

        if (!targetPlan) {
            throw new Error(`Plano '${planIdentifier}' não encontrado.`);
        }

        return targetPlan.pricing.finalPrice;
    }
};
