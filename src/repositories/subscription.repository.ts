import { supabaseAdmin } from "../config/supabase.js";
import { SubscriptionStatus } from "../types/enums.js";
import { authCacheService } from "../services/auth-cache.service.js";
import type { Tables } from "../types/database.types.js";

type AssinaturaWithPlano = Tables<"assinaturas"> & {
    planos: Tables<"planos"> | null;
};

export const subscriptionRepository = {
    async getSubscriptionByUserId(userId: string) {
        const cached = await authCacheService.getCachedSubscription<AssinaturaWithPlano>(userId);
        if (cached) {
            return { data: cached, error: null };
        }

        const res = await supabaseAdmin
            .from("assinaturas")
            .select("*, planos(*)")
            .eq("usuario_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!res.error && res.data) {
            await authCacheService.setCachedSubscription(userId, res.data);
        }

        return res;
    },

    async createTrial(userId: string, planoId: string, trialEndsAtIso: string, valorBaseMensal?: number, valorPromocionalMensal?: number, valorBaseAnual?: number, valorPromocionalAnual?: number) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .insert({
                usuario_id: userId,
                plano_id: planoId,
                status: SubscriptionStatus.TRIAL,
                trial_ends_at: trialEndsAtIso,
                valor_base_mensal: valorBaseMensal,
                valor_promocional_mensal: valorPromocionalMensal,
                valor_base_anual: valorBaseAnual,
                valor_promocional_anual: valorPromocionalAnual
            })
            .select("*, planos(*)")
            .single();

        if (!res.error && res.data) {
            await authCacheService.setCachedSubscription(userId, res.data);
        }

        return res;
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

    async getSubscriptionWithPlanByUserId(userId: string) {
        return this.getSubscriptionByUserId(userId);
    },

    async updateStatus(id: string, status: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ status })
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    },

    async updatePreferredMethodToNull(userId: string, paymentMethodId: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ metodo_pagamento_preferencial_id: null })
            .eq("usuario_id", userId)
            .eq("metodo_pagamento_preferencial_id", paymentMethodId);

        await authCacheService.invalidateSubscription(userId);
        return res;
    },

    async updatePaymentMethod(userId: string, paymentMethodId: string | null, paymentMethod: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({
                metodo_pagamento_preferencial_id: paymentMethodId || null,
                metodo_pagamento: paymentMethod,
                updated_at: new Date().toISOString()
            })
            .eq("usuario_id", userId);

        await authCacheService.invalidateSubscription(userId);
        return res;
    },


    async updateExpiry(id: string, newExpiry: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ data_vencimento: newExpiry, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    },

    async applyReferralBonus(id: string, newExpiry: string, forceActive: boolean) {
        const payload: { data_vencimento: string; updated_at: string; status?: SubscriptionStatus } = {
            data_vencimento: newExpiry,
            updated_at: new Date().toISOString()
        };

        if (forceActive) {
            payload.status = SubscriptionStatus.ACTIVE;
        }

        const res = await supabaseAdmin
            .from("assinaturas")
            .update(payload)
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    },

    async extendTrial(id: string, newTrialEnd: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ trial_ends_at: newTrialEnd, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    },

    async extendTrialBonus(id: string, newTrialEnd: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ trial_ends_at: newTrialEnd, trial_estendido: true, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    },

    async confirmInvoicePaymentRpc(faturaId: string) {
        const res = await supabaseAdmin.rpc("confirm_invoice_payment", { p_fatura_id: faturaId });
        const payload = res.data as { usuario_id?: string } | null;
        if (payload?.usuario_id) {
            await authCacheService.invalidateSubscription(payload.usuario_id);
        }
        return res;
    },

    async updatePlan(id: string, planoId: string) {
        const res = await supabaseAdmin
            .from("assinaturas")
            .update({ plano_id: planoId, updated_at: new Date().toISOString() })
            .eq("id", id)
            .select("usuario_id")
            .maybeSingle();

        if (res.data?.usuario_id) {
            await authCacheService.invalidateSubscription(res.data.usuario_id);
        }

        return res;
    }
};
