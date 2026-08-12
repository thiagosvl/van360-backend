import { supabaseAdmin } from "../config/supabase.js";
import { ListGastosFiltersDTO } from "../types/dtos/gasto.dto.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

export const gastoRepository = {
    async insert(data: Record<string, unknown>) {
        return supabaseAdmin
            .from("gastos")
            .insert([data])
            .select()
            .single();
    },

    async update(id: string, data: Record<string, unknown>) {
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

    async deleteByParcelamento(parcelamentoId: string, minNumeroParcela?: number) {
        let query = supabaseAdmin.from("gastos").delete().eq("parcelamento_id", parcelamentoId);
        if (minNumeroParcela !== undefined) {
            query = query.gte("numero_parcela", minNumeroParcela);
        }
        return query;
    },

    async updateByParcelamento(parcelamentoId: string, minNumeroParcela: number | undefined, data: Record<string, unknown>) {
        let query = supabaseAdmin.from("gastos").update(data).eq("parcelamento_id", parcelamentoId);
        if (minNumeroParcela !== undefined) {
            query = query.gte("numero_parcela", minNumeroParcela);
        }
        return query.select();
    },

    async getById(id: string, usuarioId?: string) {
        let query = supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("id", id);

        if (isValidFilterValue(usuarioId)) {
            query = query.eq("usuario_id", usuarioId);
        }

        return query.single();
    },

    async list(usuarioId: string, filtros?: ListGastosFiltersDTO) {
        let query = supabaseAdmin
            .from("gastos")
            .select("*, veiculo:veiculos(id, placa)")
            .eq("usuario_id", usuarioId)
            .order("data", { ascending: false })
            .order("categoria", { ascending: false });

        if (isValidFilterValue(filtros?.categoria)) {
            query = query.eq('categoria', filtros.categoria);
        }

        if (filtros?.veiculo_id === 'unspecified') {
            query = query.is('veiculo_id', null);
        } else if (isValidFilterValue(filtros?.veiculo_id)) {
            query = query.eq('veiculo_id', filtros.veiculo_id);
        }

        if (isValidFilterValue(filtros?.data_inicio)) query = query.gte("data", filtros.data_inicio);
        if (isValidFilterValue(filtros?.data_fim)) query = query.lte("data", filtros.data_fim);

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
            
        if (isValidFilterValue(veiculoId)) {
            query = query.eq("veiculo_id", veiculoId);
        }

        return query;
    },

    async getParcelasByParcelamentoId(parcelamentoId: string) {
        return supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("parcelamento_id", parcelamentoId)
            .order("data", { ascending: true })
            .order("created_at", { ascending: true });
    },

    async getParcelasAfetadas(parcelamentoId: string, minNumeroParcela?: number) {
        let query = supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("parcelamento_id", parcelamentoId);

        if (minNumeroParcela !== undefined) {
            query = query.gte("numero_parcela", minNumeroParcela);
        }

        return query;
    }
};
