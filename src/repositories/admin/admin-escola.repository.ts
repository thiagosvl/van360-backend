import { supabaseAdmin } from "../../config/supabase.js";

export const adminEscolaRepository = {
  async listEscolasByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("escolas")
      .select("*")
      .eq("usuario_id", userId)
      .order("nome", { ascending: true });

    if (error) throw error;
    return data || [];
  },
};
