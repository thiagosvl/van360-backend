import { supabaseAdmin } from "../../config/supabase.js";

export const adminPlanRepository = {
  async listPlanos() {
    return supabaseAdmin
      .from("planos")
      .select("*")
      .order("valor", { ascending: true });
  },

  async updatePlano(id: string, data: Record<string, unknown>) {
    return supabaseAdmin
      .from("planos")
      .update(data)
      .eq("id", id);
  },
};
