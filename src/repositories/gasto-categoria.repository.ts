import { supabaseAdmin } from "../config/supabase.js";

export const gastoCategoriaRepository = {
    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from("gasto_categorias")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: Record<string, unknown>) {
        return supabaseAdmin
            .from("gasto_categorias")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin
            .from("gasto_categorias")
            .delete()
            .eq("id", id);
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("gasto_categorias")
            .select("*")
            .eq("id", id)
            .single();
    },

    async list(usuarioId: string) {
        return supabaseAdmin
            .from("gasto_categorias")
            .select("*")
            .or(`usuario_id.is.null,usuario_id.eq.${usuarioId}`)
            .order("created_at", { ascending: true });
    },

    async getBySlugAndUsuario(slug: string, usuarioId: string) {
        return supabaseAdmin
            .from("gasto_categorias")
            .select("*")
            .eq("slug", slug)
            .eq("usuario_id", usuarioId)
            .maybeSingle();
    },

    async getByNomeAndUsuario(nome: string, usuarioId: string) {
        return supabaseAdmin
            .from("gasto_categorias")
            .select("*")
            .eq("nome", nome)
            .eq("usuario_id", usuarioId)
            .maybeSingle();
    }
};
