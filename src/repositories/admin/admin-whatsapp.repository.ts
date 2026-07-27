import { supabaseAdmin } from "../../config/supabase.js";

export const adminWhatsappRepository = {
  async getWhatsappInstances() {
    return supabaseAdmin
      .from("whatsapp_instances")
      .select("*")
      .order("created_at", { ascending: true });
  },
};
