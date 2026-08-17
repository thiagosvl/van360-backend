import { supabaseAdmin } from "../config/supabase.js";
import { ListVeiculosFiltersDTO } from "../types/dtos/veiculo.dto.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

export const veiculoRepository = {
    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from("veiculos")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: Record<string, unknown>) {
        return supabaseAdmin
            .from("veiculos")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin.from("veiculos").delete().eq("id", id);
    },

    async getSummaryForDashboard(usuarioId: string) {
        return supabaseAdmin.from("veiculos").select("id, ativo").eq("usuario_id", usuarioId);
    },

    async getById(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("veiculos")
            .select("*")
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async list(usuarioId: string, filtros?: ListVeiculosFiltersDTO) {
        const isComContagem = filtros?.comContagem === "true";
        const isSlim = filtros?.slim === "true";

        const selectStr = isSlim
            ? "id, usuario_id, placa, marca, modelo, ativo"
            : isComContagem
            ? "*, passageiros(count)"
            : "*";

        let query = supabaseAdmin
            .from("veiculos")
            .select(selectStr)
            .eq("usuario_id", usuarioId)
            .order("placa", { ascending: true });

        if (isComContagem) {
            query = query.eq("passageiros.ativo", true);
        }

        if (isValidFilterValue(filtros?.search)) {
            query = query.or(
                `placa.ilike.%${filtros.search}%,marca.ilike.%${filtros.search}%,modelo.ilike.%${filtros.search}%`
            );
        }

        if (isValidFilterValue(filtros?.placa)) query = query.eq("placa", filtros.placa);
        if (isValidFilterValue(filtros?.marca)) query = query.eq("marca", filtros.marca);
        if (isValidFilterValue(filtros?.modelo)) query = query.eq("modelo", filtros.modelo);

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
            .from("veiculos")
            .update({ ativo })
            .eq("id", id);
    },

    async getUsuarioIdAndPlaca(id: string) {
        return supabaseAdmin
            .from("veiculos")
            .select("usuario_id, placa")
            .eq("id", id)
            .single();
    },

    async countByUsuario(usuarioId: string) {
        return supabaseAdmin
            .from("veiculos")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId);
    }
};
