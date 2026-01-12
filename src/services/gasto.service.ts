import { supabaseAdmin } from "../config/supabase.js";
import { CreateGastoDTO, ListGastosFiltersDTO, UpdateGastoDTO } from "../types/dtos/gasto.dto.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString } from "../utils/string.utils.js";

// Helper Methods
const _prepareGastoData = (data: Partial<CreateGastoDTO>, usuarioId?: string, isUpdate: boolean = false): any => {
    const prepared: any = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
    }

    if (data.valor !== undefined) prepared.valor = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;
    if (data.data !== undefined) prepared.data = data.data;
    if (data.descricao !== undefined) prepared.descricao = data.descricao ? cleanString(data.descricao) : null;
    if (data.categoria !== undefined) prepared.categoria = data.categoria;
    
    if (data.veiculo_id !== undefined) {
        prepared.veiculo_id = (data.veiculo_id === "none" || !data.veiculo_id) ? null : data.veiculo_id;
    }

    if (data.km_atual !== undefined) prepared.km_atual = data.km_atual || null;
    if (data.litros !== undefined) prepared.litros = data.litros || null;
    if (data.local !== undefined) prepared.local = data.local || null;

    return prepared;
};

export const gastoService = {
    async createGasto(data: CreateGastoDTO): Promise<any> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");

        const gastoData = _prepareGastoData(data, data.usuario_id, false);

        const { data: inserted, error } = await supabaseAdmin
            .from("gastos")
            .insert([gastoData])
            .select()
            .single();
        if (error) throw error;

        return inserted;
    },

    async updateGasto(id: string, data: UpdateGastoDTO): Promise<any> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gastoData = _prepareGastoData(data, undefined, true);

        const { data: updated, error } = await supabaseAdmin
            .from("gastos")
            .update(gastoData)
            .eq("id", id)
            .select()
        if (error) throw error;

        return updated;
    },

    async deleteGasto(id: string): Promise<void> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gasto = await this.getGasto(id);

        if (gasto?.id) {
            const { error } = await supabaseAdmin.from("gastos").delete().eq("id", id);
            if (error) throw error;
        }
    },

    async getGasto(id: string): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw error;
        return data;
    },

    async listGastos(
        usuarioId: string,
        filtros?: ListGastosFiltersDTO
    ): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

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
            query = query.eq('veiculo_id', filtros.veiculo_id);
        }

        if (filtros?.data_inicio) query = query.gte("data", filtros.data_inicio);
        if (filtros?.data_fim) query = query.lte("data", filtros.data_fim);

        // Pagination
        if (filtros?.limit) query = query.limit(filtros.limit);
        if (filtros?.offset) query = query.range(filtros.offset, filtros.offset + (filtros.limit || 10) - 1);

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    },

};
