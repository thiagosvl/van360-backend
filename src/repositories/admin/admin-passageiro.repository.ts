import { supabaseAdmin } from "../../config/supabase.js";

export const adminPassageiroRepository = {
  async listPassageirosByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("passageiros")
      .select("*, escolas(nome), veiculos(modelo, placa)")
      .eq("usuario_id", userId)
      .order("nome", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async listPrePassageirosByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("pre_passageiros")
      .select("*, escolas(nome)")
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },
};
