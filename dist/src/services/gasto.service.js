import { supabaseAdmin } from "../config/supabase.js";
import { cleanString, moneyToNumber } from "../utils/utils.js";
export const gastoService = {
    async createGasto(data) {
        if (!data.usuario_id)
            throw new Error("Usuário obrigatório");
        const gastoData = {
            valor: typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor,
            data: data.data,
            descricao: cleanString(data.descricao, true),
            categoria: data.categoria,
            usuario_id: data.usuario_id,
        };
        const { data: inserted, error } = await supabaseAdmin
            .from("gastos")
            .insert([gastoData])
            .select()
            .single();
        if (error)
            throw error;
        return inserted;
    },
    async updateGasto(id, data) {
        if (!id)
            throw new Error("ID do gasto é obrigatório");
        const gastoData = { ...data };
        if (typeof data.valor === "string")
            gastoData.valor = moneyToNumber(data.valor);
        if (data.data)
            gastoData.data = data.data;
        if (data.categoria)
            gastoData.categoria = data.categoria;
        if (data.descricao)
            gastoData.descricao = cleanString(data.descricao, true);
        const { data: updated, error } = await supabaseAdmin
            .from("gastos")
            .update(gastoData)
            .eq("id", id)
            .select();
        if (error)
            throw error;
        return updated;
    },
    async deleteGasto(id) {
        if (!id)
            throw new Error("ID do gasto é obrigatório");
        const gasto = await this.getGasto(id);
        if (gasto?.id) {
            const { error } = await supabaseAdmin.from("gastos").delete().eq("id", id);
            if (error)
                throw error;
        }
    },
    async getGasto(id) {
        const { data, error } = await supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("id", id)
            .single();
        if (error)
            throw error;
        return data;
    },
    async listGastos(usuarioId, filtros) {
        if (!usuarioId)
            throw new Error("Usuário obrigatório");
        let query = supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("usuario_id", usuarioId)
            .order("data", { ascending: false })
            .order("categoria", { ascending: false });
        if (filtros && filtros.categoria) {
            query = query.eq('categoria', filtros.categoria);
        }
        if (filtros && filtros.mes && filtros.ano) {
            const ano = parseInt(filtros.ano);
            const mes = parseInt(filtros.mes);
            const firstDay = new Date(ano, mes - 1, 1).toISOString();
            const lastDay = new Date(ano, mes, 0, 23, 59, 59).toISOString();
            query = query.gte("data", firstDay).lte("data", lastDay);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return data || [];
    },
};
