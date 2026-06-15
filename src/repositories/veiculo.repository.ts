import { supabaseAdmin } from "../config/supabase.js";
import { ListVeiculosFiltersDTO } from "../types/dtos/veiculo.dto.js";

export const veiculoRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from("veiculos")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: any) {
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

    async getById(id: string) {
        return supabaseAdmin
            .from("veiculos")
            .select("*")
            .eq("id", id)
            .single();
    },

    async list(usuarioId: string, filtros?: ListVeiculosFiltersDTO) {
        let query = supabaseAdmin
            .from("veiculos")
            .select("*")
            .eq("usuario_id", usuarioId)
            .order("placa", { ascending: true });

        if (filtros?.search) {
            query = query.or(
                `placa.ilike.%${filtros.search}%,marca.ilike.%${filtros.search}%,modelo.ilike.%${filtros.search}%`
            );
        }

        if (filtros?.placa) query = query.eq("placa", filtros.placa);
        if (filtros?.marca) query = query.eq("marca", filtros.marca);
        if (filtros?.modelo) query = query.eq("modelo", filtros.modelo);

        if (filtros?.ativo !== undefined && filtros?.includeId) {
            query = query.or(`ativo.eq.${filtros.ativo === "true"},id.eq.${filtros.includeId}`);
        } else if (filtros?.ativo !== undefined) {
            query = query.eq("ativo", filtros.ativo === "true");
        } else if (filtros?.includeId) {
            query = query.eq("id", filtros.includeId);
        }

        return query;
    },

    async listComContagemAtivos(usuarioId: string, filtros?: ListVeiculosFiltersDTO) {
        let query = supabaseAdmin
            .from("veiculos")
            .select(`*, passageiros(count)`)
            .eq("usuario_id", usuarioId)
            .eq("passageiros.ativo", true)
            .order("placa", { ascending: true });

        if (filtros?.search) {
            query = query.or(
                `placa.ilike.%${filtros.search}%,marca.ilike.%${filtros.search}%,modelo.ilike.%${filtros.search}%`
            );
        }

        if (filtros?.placa) query = query.eq("placa", filtros.placa);
        if (filtros?.marca) query = query.eq("marca", filtros.marca);
        if (filtros?.modelo) query = query.eq("modelo", filtros.modelo);

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
