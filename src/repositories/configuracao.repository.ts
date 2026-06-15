import { supabaseAdmin } from "../config/supabase.js";

export const configuracaoRepository = {
    async getByKey(key: string) {
        return supabaseAdmin
            .from("configuracao_interna")
            .select("valor")
            .eq("chave", key)
            .single();
    }
};
