import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus, SubscriptionInvoiceStatus, CheckoutPaymentMethod, SubscriptionIdentifer } from "../types/enums.js";

export const monitorRepository = {
    async cancelExpiredPendingInvoices(now: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .update({ status: SubscriptionInvoiceStatus.CANCELED, updated_at: now })
            .eq("status", SubscriptionInvoiceStatus.PENDING)
            .lt("data_vencimento", now);
    },

    async getExpiringTrials(windowStart: string, windowEnd: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, trial_ends_at, trial_estendido, usuarios(nome, telefone, email)")
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
            .select("id, status, trial_ends_at, trial_estendido, usuario_id, usuarios(nome, telefone, email)")
            .eq("status", SubscriptionStatus.TRIAL)
            .lte("trial_ends_at", now);
    },

    async getExpiredTrialsForRecovery(windows: {from: string, to: string}[]) {
        let query = supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, trial_ends_at, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.EXPIRED)
            .is("data_vencimento", null)
            .not("trial_ends_at", "is", null);

        if (windows.length > 0) {
            const orFilters = windows.map(w => `and(trial_ends_at.gte.${w.from},trial_ends_at.lte.${w.to})`);
            query = query.or(orFilters.join(','));
        }

        return query;
    },

    async getPromotionValue() {
        return supabaseAdmin
            .from("planos")
            .select("valor_promocional")
            .eq("identificador", SubscriptionIdentifer.MONTHLY)
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
            .select("id, usuario_id, data_vencimento, metodo_pagamento, planos(nome, valor), usuarios(nome, telefone)")
            .in("status", [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE])
            .lte("data_vencimento", graceLimitDate);
    },

    async getPastDueForReminders(windows: {from: string, to: string}[]) {
        let query = supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, metodo_pagamento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.PAST_DUE)
            .not("data_vencimento", "is", null);

        if (windows.length > 0) {
            const orFilters = windows.map(w => `and(data_vencimento.gte.${w.from},data_vencimento.lte.${w.to})`);
            query = query.or(orFilters.join(','));
        }

        return query;
    },

    async getPendingInvoiceByUserId(userId: string) {
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("valor, pix_copy_paste")
            .eq("usuario_id", userId)
            .eq("status", SubscriptionInvoiceStatus.PENDING)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
    },


    async getExpiredForRenewals(windows: {from: string, to: string}[]) {
        let query = supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.EXPIRED)
            .not("data_vencimento", "is", null);

        if (windows.length > 0) {
            const orFilters = windows.map(w => `and(data_vencimento.gte.${w.from},data_vencimento.lte.${w.to})`);
            query = query.or(orFilters.join(','));
        }

        return query;
    },

    async getExpiredForRecovery(windows: {from: string, to: string}[]) {
        let query = supabaseAdmin
            .from("assinaturas")
            .select("id, usuario_id, data_vencimento, usuarios(nome, telefone)")
            .eq("status", SubscriptionStatus.EXPIRED)
            .not("data_vencimento", "is", null);

        if (windows.length > 0) {
            const orFilters = windows.map(w => `and(data_vencimento.gte.${w.from},data_vencimento.lte.${w.to})`);
            query = query.or(orFilters.join(','));
        }

        return query;
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
            .eq("metodo_pagamento", CheckoutPaymentMethod.CREDIT_CARD)
            .eq("status", SubscriptionInvoiceStatus.FAILED)
            .gte("created_at", sinceStr);
    },

    async getPassengerCountsByUsers(userIds: string[]) {
        if (userIds.length === 0) return { data: [] };
        return supabaseAdmin
            .from("passageiros")
            .select("usuario_id")
            .in("usuario_id", userIds);
    },

    async getPendingInvoicesByUsers(userIds: string[]) {
        if (userIds.length === 0) return { data: [] };
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("id, usuario_id, valor, pix_copy_paste")
            .in("usuario_id", userIds)
            .eq("status", SubscriptionInvoiceStatus.PENDING);
    },

    async getFailedCardInvoicesByUsers(userIds: string[], sinceStr: string) {
        if (userIds.length === 0) return { data: [] };
        return supabaseAdmin
            .from("assinatura_faturas")
            .select("usuario_id")
            .in("usuario_id", userIds)
            .eq("metodo_pagamento", CheckoutPaymentMethod.CREDIT_CARD)
            .eq("status", SubscriptionInvoiceStatus.FAILED)
            .gte("created_at", sinceStr);
    }
};
