import { supabaseAdmin } from "../../config/supabase.js";

export const adminConfigRepository = {
  async listConfigs() {
    return supabaseAdmin
      .from("configuracao_interna")
      .select("*")
      .order("chave", { ascending: true });
  },

  async updateConfig(chave: string, valor: string) {
    return supabaseAdmin
      .from("configuracao_interna")
      .upsert({ chave, valor }, { onConflict: "chave" });
  },
};
