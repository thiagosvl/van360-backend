import { supabaseAdmin } from "../config/supabase.js";
import { CreateEscolaDTO, ListEscolasFiltersDTO, UpdateEscolaDTO } from "../types/dtos/escola.dto.js";
import { cleanString } from "../utils/string.utils.js";

// Helper Methods
const _prepareEscolaData = (data: Partial<CreateEscolaDTO>, usuarioId?: string, isUpdate: boolean = false): any => {
    const prepared: any = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
        prepared.ativo = true;
    }

    if (data.nome) prepared.nome = cleanString(data.nome, true);
    if (data.logradouro !== undefined) prepared.logradouro = data.logradouro ? cleanString(data.logradouro, true) : null;
    if (data.numero !== undefined) prepared.numero = data.numero || null;
    if (data.bairro !== undefined) prepared.bairro = data.bairro ? cleanString(data.bairro, true) : null;
    if (data.cidade !== undefined) prepared.cidade = data.cidade ? cleanString(data.cidade, true) : null;
    if (data.estado !== undefined) prepared.estado = data.estado ? cleanString(data.estado, true) : null;
    if (data.cep !== undefined) prepared.cep = data.cep ? cleanString(data.cep) : null;
    if (data.referencia !== undefined) prepared.referencia = data.referencia ? cleanString(data.referencia, true) : null;
    if (data.ativo !== undefined) prepared.ativo = data.ativo;

    return prepared;
};

export const escolaService = {
    async createEscola(data: CreateEscolaDTO): Promise<any> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");
        if (!data.nome) throw new Error("Nome da escola é obrigatório");

        const escolaData = _prepareEscolaData(data, data.usuario_id, false);

        const { data: inserted, error } = await supabaseAdmin
            .from("escolas")
            .insert([escolaData])
            .select()
            .single();
        if (error) throw error;

        return inserted;
    },

    async updateEscola(id: string, data: UpdateEscolaDTO): Promise<any> {
        if (!id) throw new Error("ID da escola é obrigatório");

        const escolaData = _prepareEscolaData(data, undefined, true);

        const { data: updated, error } = await supabaseAdmin
            .from("escolas")
            .update(escolaData)
            .eq("id", id)
            .select()
            .single();
        if (error) throw error;

        return updated;
    },

    async deleteEscola(id: string): Promise<void> {
        if (!id) throw new Error("ID da escola é obrigatório");

        const escola = await this.getEscola(id);

        if (escola?.id) {
            const { error } = await supabaseAdmin.from("escolas").delete().eq("id", id);
            if (error) throw error;
        }
    },

    async getEscola(id: string): Promise<any> {
        const { data, error } = await supabaseAdmin
            .from("escolas")
            .select("*")
            .eq("id", id)
            .single();
        if (error) throw error;
        return data;
    },

    async listEscolas(
        usuarioId: string,
        filtros?: ListEscolasFiltersDTO
    ): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

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

        const { data, error } = await query;
        if (error) throw error;

        return data || [];
    },

    async listEscolasComContagemAtivos(usuarioId: string): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await supabaseAdmin
            .from("escolas")
            .select(`*, passageiros(count)`)
            .eq("usuario_id", usuarioId)
            .eq("passageiros.ativo", true)
            .order("nome", { ascending: true });

        if (error) throw error;

        return (data || []).map(escola => ({
            ...escola,
            passageiros_ativos_count: escola.passageiros[0]?.count || 0,
        }));
    },

    async toggleAtivo(escolaId: string, novoStatus: boolean): Promise<boolean> {
        const { error } = await supabaseAdmin
            .from("escolas")
            .update({ ativo: novoStatus })
            .eq("id", escolaId);

        if (error) throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} a escola.`);
        return novoStatus;
    },

    async countListEscolasByUsuario(usuarioId: string): Promise<number> {
        const { count, error } = await supabaseAdmin
            .from("escolas")
            .select("id", { count: "exact", head: true })
            .eq("usuario_id", usuarioId);

        if (error) throw new Error(error.message || "Erro ao contar escolas");
        return count || 0;
    },
};
