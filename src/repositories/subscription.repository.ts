import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus } from "../types/enums.js";

export const subscriptionRepository = {
    async getSubscriptionByUserId(userId: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("*, planos(*)")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
    },

    async createTrial(userId: string, planoId: string, trialEndsAtIso: string) {
        return supabaseAdmin
            .from("assinaturas")
            .insert({
                usuario_id: userId,
                plano_id: planoId,
                status: SubscriptionStatus.TRIAL,
                trial_ends_at: trialEndsAtIso
            })
            .select("*, planos(*)")
            .single();
    },

    async getSubscriptionStatus(userId: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("status")
            .eq("usuario_id", userId)
            .maybeSingle();
    },

    async getSubscriptionById(id: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("*")
            .eq("id", id)
            .single();
    },

    async getSubscriptionWithPlan(id: string) {
        return supabaseAdmin
            .from("assinaturas")
            .select("*, planos(*)")
            .eq("id", id)
            .single();
    },

    async updateStatus(id: string, status: string) {
        return supabaseAdmin
            .from("assinaturas")
            .update({ status })
            .eq("id", id);
    },

    async updatePreferredMethod(id: string, preferredMethodId: string) {
        return supabaseAdmin
            .from("assinaturas")
            .update({ metodo_pagamento_preferencial_id: preferredMethodId })
            .eq("id", id);
    },

    async updatePreferredMethodToNull(userId: string, paymentMethodId: string) {
        return supabaseAdmin
            .from("assinaturas")
            .update({ metodo_pagamento_preferencial_id: null })
            .eq("usuario_id", userId)
            .eq("metodo_pagamento_preferencial_id", paymentMethodId);
    },

    async updatePaymentMethod(userId: string, paymentMethodId: string, paymentMethod: string) {
        return supabaseAdmin
            .from("assinaturas")
            .update({
                metodo_pagamento_preferencial_id: paymentMethodId,
                metodo_pagamento: paymentMethod,
                updated_at: new Date().toISOString()
            })
            .eq("usuario_id", userId);
    },


    async updateExpiry(id: string, newExpiry: string) {
        return supabaseAdmin
            .from("assinaturas")
            .update({ data_vencimento: newExpiry, updated_at: new Date().toISOString() })
            .eq("id", id);
    }
};
