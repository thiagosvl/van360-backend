import { supabaseAdmin } from "../config/supabase.js";
import { ListEscolasFiltersDTO } from "../types/dtos/escola.dto.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

export const escolaRepository = {
    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from("escolas")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: Record<string, unknown>) {
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

    async getById(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("escolas")
            .select("*")
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async list(usuarioId: string, filtros?: ListEscolasFiltersDTO) {
        const isComContagem = filtros?.comContagem === "true";
        const isSlim = filtros?.slim === "true";

        const selectStr = isSlim
            ? "id, usuario_id, nome, ativo"
            : isComContagem
            ? "*, passageiros(count)"
            : "*";

        let query = supabaseAdmin
            .from("escolas")
            .select(selectStr)
            .eq("usuario_id", usuarioId)
            .order("nome", { ascending: true });

        if (isComContagem) {
            query = query.eq("passageiros.ativo", true);
        }

        if (isValidFilterValue(filtros?.search)) {
            query = query.or(
                `nome.ilike.%${filtros.search}%,cidade.ilike.%${filtros.search}%,estado.ilike.%${filtros.search}%`
            );
        }

        if (isValidFilterValue(filtros?.nome)) query = query.eq("nome", filtros.nome);
        if (isValidFilterValue(filtros?.cidade)) query = query.eq("cidade", filtros.cidade);
        if (isValidFilterValue(filtros?.estado)) query = query.eq("estado", filtros.estado);

        const hasValidIncludeId = isValidFilterValue(filtros?.includeId);
        const hasValidAtivo = isValidFilterValue(filtros?.ativo);
        if (hasValidAtivo && hasValidIncludeId) {
            query = query.or(`ativo.eq.${filtros?.ativo === "true"},id.eq.${filtros?.includeId}`);
        } else if (hasValidAtivo) {
            query = query.eq("ativo", filtros?.ativo === "true");
        } else if (hasValidIncludeId) {
            query = query.eq("id", filtros?.includeId);
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
