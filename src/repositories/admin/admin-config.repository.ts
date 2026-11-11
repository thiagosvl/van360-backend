import { supabaseAdmin } from "../../config/supabase.js";
import { configuracaoRepository } from "../configuracao.repository.js";

export const adminConfigRepository = {
  async listConfigs() {
    return supabaseAdmin
      .from("configuracao_interna")
      .select("*")
      .order("chave", { ascending: true });
  },

  async updateConfig(chave: string, valor: string) {
    const res = await supabaseAdmin
      .from("configuracao_interna")
      .upsert({ chave, valor }, { onConflict: "chave" });

    await configuracaoRepository.invalidateCache();
    return res;
  },
};
