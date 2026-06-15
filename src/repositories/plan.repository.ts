import { supabaseAdmin } from "../config/supabase.js";

export const planRepository = {
    async getByIdentifier(identificador: string) {
        return supabaseAdmin
            .from("planos")
            .select("*")
            .eq("identificador", identificador)
            .single();
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("planos")
            .select("*")
            .eq("id", id)
            .single();
    },

    async listActivePlans() {
        return supabaseAdmin
            .from("planos")
            .select("*")
            .eq("ativo", true)
            .order("valor", { ascending: true });
    }
};
