import { supabaseAdmin } from "../config/supabase.js";
import { ListEscolasFiltersDTO } from "../types/dtos/escola.dto.js";

export const escolaRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from("escolas")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: any) {
        return supabaseAdmin
            .from("escolas")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin.from("escolas").delete().eq("id", id);
    },

    async getSummaryForDashboard(usuarioId: string) {
        return supabaseAdmin.from("escolas").select("id, ativo").eq("usuario_id", usuarioId);
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("escolas")
            .select("*")
            .eq("id", id)
            .single();
    },

    async list(usuarioId: string, filtros?: ListEscolasFiltersDTO) {
        let query = supabaseAdmin
            .from("escolas")
            .select("*")
            .eq("usuario_id", usuarioId)
            .order("nome", { ascending: true });

        if (filtros?.search) {
            query = query.or(
                `nome.ilike.%${filtros.search}%,cidade.ilike.%${filtros.search}%,estado.ilike.%${filtros.search}%`
            );
        }

        if (filtros?.nome) query = query.eq("nome", filtros.nome);
        if (filtros?.cidade) query = query.eq("cidade", filtros.cidade);
        if (filtros?.estado) query = query.eq("estado", filtros.estado);

        if (filtros?.ativo !== undefined && filtros?.includeId) {
            query = query.or(`ativo.eq.${filtros.ativo === "true"},id.eq.${filtros.includeId}`);
        } else if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        } else if (filtros?.includeId) {
            query = query.eq("id", filtros.includeId);
        }

        return query;
    },

    async listComContagemAtivos(usuarioId: string, filtros?: ListEscolasFiltersDTO) {
        let query = supabaseAdmin
            .from("escolas")
            .select(`*, passageiros(count)`)
            .eq("usuario_id", usuarioId)
            .eq("passageiros.ativo", true)
            .order("nome", { ascending: true });

        if (filtros?.search) {
            query = query.or(
                `nome.ilike.%${filtros.search}%,cidade.ilike.%${filtros.search}%,estado.ilike.%${filtros.search}%`
            );
        }

        if (filtros?.nome) query = query.eq("nome", filtros.nome);
        if (filtros?.cidade) query = query.eq("cidade", filtros.cidade);
        if (filtros?.estado) query = query.eq("estado", filtros.estado);

        if (filtros?.ativo !== undefined && filtros?.includeId) {
            query = query.or(`ativo.eq.${filtros.ativo === "true"},id.eq.${filtros.includeId}`);
        } else if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        } else if (filtros?.includeId) {
            query = query.eq("id", filtros.includeId);
        }

        return query;
    },

    async updateAtivo(id: string, ativo: boolean) {
        return supabaseAdmin
            .from("escolas")
            .update({ ativo })
            .eq("id", id);
    },

    async getUsuarioIdAndNome(id: string) {
        return supabaseAdmin
            .from("escolas")
            .select("usuario_id, nome")
            .eq("id", id)
            .single();
    },

    async countByUsuario(usuarioId: string) {
        return supabaseAdmin
            .from("escolas")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId);
    }
};
