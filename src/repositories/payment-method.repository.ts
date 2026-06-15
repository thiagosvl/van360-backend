import { supabaseAdmin } from "../config/supabase.js";

export const paymentMethodRepository = {
    async getByUserId(userId: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .select("id, brand, last_4_digits, expire_month, expire_year, is_default, created_at")
            .eq("usuario_id", userId)
            .order("is_default", { ascending: false })
            .order("created_at", { ascending: false });
    },

    async deleteMethod(userId: string, paymentMethodId: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .delete()
            .eq("id", paymentMethodId)
            .eq("usuario_id", userId);
    },

    async clearDefaults(userId: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .update({ is_default: false })
            .eq("usuario_id", userId);
    },

    async setDefault(userId: string, paymentMethodId: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .update({ is_default: true })
            .eq("id", paymentMethodId)
            .eq("usuario_id", userId);
    },

    async getSavedCard(userId: string, cardIdToUse: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .select("*")
            .eq("id", cardIdToUse)
            .eq("usuario_id", userId)
            .single();
    },

    async findMatchingCard(userId: string, brand: string, last4: string, expMonth: string, expYear: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .select("id")
            .eq("usuario_id", userId)
            .eq("brand", brand)
            .eq("last_4_digits", last4)
            .eq("expire_month", expMonth)
            .eq("expire_year", expYear)
            .maybeSingle();
    },

    async updateTokenAndDefault(id: string, token: string) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .update({ payment_token: token, is_default: true })
            .eq("id", id);
    },

    async createMethod(data: {
        usuario_id: string;
        brand: string;
        last_4_digits: string;
        expire_month: string;
        expire_year: string;
        payment_token: string;
        is_default: boolean;
    }) {
        return supabaseAdmin
            .from("metodos_pagamento")
            .insert(data)
            .select("id")
            .single();
    }
};
