import { supabaseAdmin } from "../../config/supabase.js";

export const adminNotificationRepository = {
  async getUserNotifications(userId: string, from: number, to: number) {
    return supabaseAdmin
      .from("fila_notificacoes")
      .select("*", { count: "exact" })
      .eq("usuario_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);
  },

  async getPassengerNotifications(passageiroId: string, from: number, to: number) {
    return supabaseAdmin
      .from("fila_notificacoes")
      .select("*", { count: "exact" })
      .eq("passageiro_id", passageiroId)
      .order("created_at", { ascending: false })
      .range(from, to);
  },
};
