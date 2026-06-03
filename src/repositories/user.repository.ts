import { supabaseAdmin } from "../config/supabase.js";

export const userRepository = {
    async getById(id: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("*")
            .eq("id", id)
            .single();
    },

    async getByPhoneExcludingId(phone: string, excludeId: string) {
        return supabaseAdmin
            .from("usuarios")
            .select("id")
            .eq("telefone", phone)
            .neq("id", excludeId)
            .maybeSingle();
    }
};
