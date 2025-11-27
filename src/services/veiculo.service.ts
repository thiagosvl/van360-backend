import { supabaseAdmin } from "../config/supabase.js";
import { cleanString } from "../utils/utils.js";

export const veiculoService = {
    async createVeiculo(data: any): Promise<any> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");
        if (!data.placa) throw new Error("Placa é obrigatória");

        const veiculoData: any = {
            ...data,
            placa: cleanString(data.placa).toUpperCase(),
            marca: data.marca ? cleanString(data.marca) : null,
            modelo: data.modelo ? cleanString(data.modelo) : null,
            ativo: true,
        };

        const { data: inserted, error } = await supabaseAdmin
            .from("veiculos")
            .insert([veiculoData])
            .select()
            .single();
        if (error) throw error;

        return inserted;
    },

    async updateVeiculo(id: string, data: Partial<any>): Promise<any> {
        if (!id) throw new Error("ID do veículo é obrigatório");

        const veiculoData: any = { ...data };
        if (data.placa) veiculoData.placa = cleanString(data.placa).toUpperCase();
        if (data.marca) veiculoData.marca = cleanString(data.marca);
        if (data.modelo) veiculoData.modelo = cleanString(data.modelo);

        const { data: updated, error } = await supabaseAdmin
            .from("veiculos")
            .update(veiculoData)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;

        return updated;
    },

    async deleteVeiculo(id: string): Promise<void> {
        if (!id) throw new Error("ID do veículo é obrigatório");

        const veiculo = await this.getVeiculo(id);

        if (veiculo?.id) {
            const { error } = await supabaseAdmin.from("veiculos").delete().eq("id", id);
            if (error) throw error;
        }
    },

    async getVeiculo(id: string): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from("veiculos")
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw error;
        return data;
    },

    async listVeiculos(
        usuarioId: string,
        filtros?: {
            search?: string;
            placa?: string;
            marca?: string;
            modelo?: string;
            ativo?: string;
            includeId?: string;
        }
    ): Promise<any[]> {
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

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    },

    async listVeiculosComContagemAtivos(usuarioId: string): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await supabaseAdmin
            .from("veiculos")
            .select(`*, passageiros(count)`)
            .eq("usuario_id", usuarioId)
            .eq("passageiros.ativo", true)
            .order("placa", { ascending: true });

        if (error) throw error;

        return (data || []).map((veiculo: any) => ({
            ...veiculo,
            passageiros_ativos_count: veiculo.passageiros[0]?.count || 0,
        }));
    },

    async toggleAtivo(veiculoId: string, novoStatus: boolean): Promise<boolean> {
        const { error } = await supabaseAdmin
            .from("veiculos")
            .update({ ativo: novoStatus })
            .eq("id", veiculoId);

        if (error) {
            throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} o veículo.`);
        }

        return novoStatus;
    },

    async countListVeiculosByUsuario(usuarioId: string): Promise<number> {
        const { count, error } = await supabaseAdmin
            .from("veiculos")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId);

        if (error) throw new Error(error.message || "Erro ao contar veículos");
        return count || 0;
    },
};
