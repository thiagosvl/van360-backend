import { supabaseAdmin } from "../../config/supabase.js";

export const adminVeiculoRepository = {
  async listVeiculosByUserId(userId: string) {
    const { data, error } = await supabaseAdmin
      .from("veiculos")
      .select("*")
      .eq("usuario_id", userId)
      .order("modelo", { ascending: true });

    if (error) throw error;
    return data || [];
  },
};
