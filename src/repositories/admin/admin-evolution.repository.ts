import { supabaseAdmin } from "../../config/supabase.js";

export const adminEvolutionRepository = {
  async getEvolutionInstances() {
    return supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .order("created_at", { ascending: true });
  },
};
