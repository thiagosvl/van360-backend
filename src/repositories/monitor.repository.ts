import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus } from "../types/enums.js";

export const monitorRepository = {
    async cancelExpiredPendingInvoices(now: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .update({ status: "CANCELED", updated_at: now })
            .eq("status", "PENDING")
            .lt("data_vencimento", now);
    },

    async getExpiringTrials(windowStart: string, windowEnd: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, trial_ends_at, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.TRIAL)
            .gte("trial_ends_at", windowStart)
            .lte("trial_ends_at", windowEnd);
    },

    async getMidpointTrials(from: string, to: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, trial_ends_at, data_inicio, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.TRIAL)
            .gte("data_inicio", from)
            .lte("data_inicio", to);
    },

    async getPassengerCount(userId: string) {
        return supabaseAdmin
            .from("passageiros")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", userId);
    },

    async getExpiredTrials(now: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, status, trial_ends_at, usuario_id, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.TRIAL)
            .lte("trial_ends_at", now);
    },

    async getExpiredTrialsForRecovery() {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, trial_ends_at, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.EXPIRED)
            .is("data_vencimento", null)
            .not("trial_ends_at", "is", null);
    },

    async getPromotionValue() {
        return supabaseAdmin
            .from("planos")
            .select("valor_promocional")
            .eq("identificador", "MONTHLY")
            .maybeSingle();
    },

    async getPastDueForGracePeriod(nowStr: string, graceLimitDate: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.ACTIVE)
            .lte("data_vencimento", nowStr)
            .gt("data_vencimento", graceLimitDate);
    },

    async getExpiredForGracePeriod(graceLimitDate: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, usuarios(nome, telefone)")
            .in("status", [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE])
            .lte("data_vencimento", graceLimitDate);
    },

    async getPastDueForReminders() {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, metodo_pagamento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.PAST_DUE)
            .not("data_vencimento", "is", null);
    },

    async getPendingInvoiceByUserId(userId: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("id, valor, pix_copy_paste")
            .eq("usuario_id", userId)
            .eq("status", "PENDING")
            .maybeSingle();
    },

    async getExpiredForRecovery() {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.EXPIRED)
            .not("data_vencimento", "is", null);
    },

    async getExpiringSubscriptions(thresholdStr: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("*, planos(*), metodos_pagamento(last_4_digits), usuarios(nome, telefone)")
            .in("status", [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE])
            .lte("data_vencimento", thresholdStr);
    },

    async getFailedCardInvoicesCount(userId: string, sinceStr: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", userId)
            .eq("metodo_pagamento", "credit_card")
            .eq("status", "FAILED")
            .gte("created_at", sinceStr);
    }
};
