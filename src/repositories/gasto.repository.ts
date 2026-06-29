import { supabaseAdmin } from "../config/supabase.js";
import { ListGastosFiltersDTO } from "../types/dtos/gasto.dto.js";

export const gastoRepository = {
    async insert(data: any) {
        return supabaseAdmin
            .from("gastos")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: any) {
        return supabaseAdmin
            .from("gastos")
            .update(data)
            .eq("id", id)
            .select()
            .single();
    },

    async delete(id: string) {
        return supabaseAdmin.from("gastos").delete().eq("id", id);
    },

    async getById(id: string) {
        return supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("id", id)
            .single();
    },

    async list(usuarioId: string, filtros?: ListGastosFiltersDTO) {
        let query = supabaseAdmin
            .from("gastos")
            .select("*, veiculo:veiculos(id, placa)")
            .eq("usuario_id", usuarioId)
            .order("data", { ascending: false })
            .order("categoria", { ascending: false });

        if (filtros && filtros.categoria) {
            query = query.eq('categoria', filtros.categoria);
        }

        if (filtros && filtros.veiculo_id) {
            if (filtros.veiculo_id === 'unspecified') {
                 query = query.is('veiculo_id', null);
            } else {
                 query = query.eq('veiculo_id', filtros.veiculo_id);
            }
        }

        if (filtros?.data_inicio) query = query.gte("data", filtros.data_inicio);
        if (filtros?.data_fim) query = query.lte("data", filtros.data_fim);

        if (filtros?.search) {
             query = query.ilike('descricao', `%${filtros.search}%`);
        }

        // Pagination
        if (filtros?.limit) query = query.limit(filtros.limit);
        if (filtros?.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limit || 10) - 1);

        return query;
    },

    async getGastosForPeriodForDashboard(usuarioId: string, start: string, end: string, veiculoId?: string) {
        let query = supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("usuario_id", usuarioId)
            .gte("data", start)
            .lte("data", end);
            
        if (veiculoId) {
            query = query.eq("veiculo_id", veiculoId);
        }

        return query;
    }
};
