import { z } from "zod";
import { CheckoutPaymentMethod } from "../enums.js";

export const createInvoiceSchema = z.object({
    planId: z.string().uuid(),
    paymentMethod: z.nativeEnum(CheckoutPaymentMethod).default(CheckoutPaymentMethod.PIX),
    installments: z.number().int().min(1).max(24).optional(),
    paymentToken: z.string().optional(),
    savedCardId: z.string().uuid().optional(),
    saveCard: z.boolean().optional().default(true),
    cardBrand: z.string().optional(),
    cardLast4: z.string().optional(),
    expireMonth: z.string().optional(),
    expireYear: z.string().optional(),
    birth: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    neighborhood: z.string().optional(),
    zipcode: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    origem: z.enum(["MANUAL", "AUTOMATICO"]).optional(),
});

export type CreateInvoiceDTO = z.infer<typeof createInvoiceSchema>;

export interface PlanPricingDTO {
    basePrice: number;
    regularPrice: number;
    finalPrice: number;
    monthlyEquivalent: number;
    totalAnnualSavings: number;
    freeMonths: number;
    discountPercent: number;
    hasPromo: boolean;
    hasOverride: boolean;
    hasReferralDiscount: boolean;
    referralDiscountPct: number;
    referralDiscountAmount: number;
}

export interface SubscriptionPricingSummaryDTO {
    monthlyPrice: number;
    annualPrice: number;
    baseMonthlyPrice: number;
    baseAnnualPrice: number;
    regularMonthlyPrice: number;
    regularAnnualPrice: number;
    annualMonthlyEquivalent: number;
    totalAnnualSavings: number;
    freeMonths: number;
    discountPercent: number;
    hasPromoMonthly: boolean;
    hasPromoAnnual: boolean;
    hasOverride: boolean;
    hasReferralDiscount: boolean;
    referralDiscountPct: number;
}

export interface SaaSPlanWithPricingDTO {
    id: string;
    nome: string;
    identificador: string;
    valor: number;
    valor_promocional: number | null;
    ativo: boolean;
    pricing: PlanPricingDTO;
}

export interface PlansResponseDTO {
    plans: SaaSPlanWithPricingDTO[];
    isPromotionActive: boolean;
    pricingSummary: SubscriptionPricingSummaryDTO;
}
