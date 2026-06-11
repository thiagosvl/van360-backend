import { supabaseAdmin } from "../config/supabase.js";

export const prePassageiroRepository = {
  async listPrePassageiros(usuarioId: string, search?: string) {
    let query = supabaseAdmin
      .from("pre_passageiros")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("created_at");

    if (search?.trim().length) {
      query = query.or(
        `nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  },

    async insert(data: Record<string, any>) {
        const { data: result, error } = await supabaseAdmin
            .from("pre_passageiros")
            .insert([data])
            .select()
            .single();

        if (error) throw error;

        return result;
    },

    async getById(id: string, usuarioId: string) {
        return supabaseAdmin
            .from("pre_passageiros")
            .select("*")
            .eq("id", id)
            .eq("usuario_id", usuarioId)
            .single();
    },

  async delete(id: string) {
    const { error } = await supabaseAdmin
      .from("pre_passageiros")
      .delete()
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async getCountForDashboard(usuarioId: string) {
    return supabaseAdmin.from("pre_passageiros").select("id", { count: "exact", head: true }).eq("usuario_id", usuarioId);
  }
};
