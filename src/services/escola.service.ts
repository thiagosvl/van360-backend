import { escolaRepository } from "../repositories/escola.repository.js";
import { CreateEscolaDTO, ListEscolasFiltersDTO, UpdateEscolaDTO } from "../types/dtos/escola.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { cleanString } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";

// Helper Methods
const _prepareEscolaData = (data: Partial<CreateEscolaDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

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

        const { data: inserted, error } = await escolaRepository.insert(escolaData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: inserted.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.ESCOLA,
            entidade_id: inserted.id,
            acao: AtividadeAcao.ESCOLA_CRIADA,
            descricao: `Nova escola ${inserted.nome} cadastrada.`,
            meta: { nome: inserted.nome }
        });

        return inserted;
    },

    async updateEscola(id: string, data: UpdateEscolaDTO): Promise<any> {
        if (!id) throw new Error("ID da escola é obrigatório");

        const escolaData = _prepareEscolaData(data, undefined, true);

        const { data: updated, error } = await escolaRepository.update(id, escolaData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: updated.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.ESCOLA,
            entidade_id: id,
            acao: AtividadeAcao.ESCOLA_EDITADA,
            descricao: `Dados da escola ${updated.nome} foram editados.`,
            meta: { nome: updated.nome }
        });

        return updated;
    },

    async deleteEscola(id: string): Promise<void> {
        if (!id) throw new Error("ID da escola é obrigatório");

        const escola = await this.getEscola(id);

        if (escola?.id) {
            const { error } = await escolaRepository.delete(id);
            if (error) throw error;

            // --- LOG DE AUDITORIA ---
            historicoService.log({
                usuario_id: escola.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.ESCOLA,
                entidade_id: id,
                acao: AtividadeAcao.ESCOLA_EXCLUIDA,
                descricao: `Escola ${escola.nome} excluída do cadastro.`,
                meta: { backup: escola }
            });
        }
    },

    async getEscola(id: string): Promise<any> {
        const { data, error } = await escolaRepository.getById(id);
        if (error) throw error;
        return data;
    },

    async listEscolas(
        usuarioId: string,
        filtros?: ListEscolasFiltersDTO
    ): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await escolaRepository.list(usuarioId, filtros);
        if (error) throw error;

        return data || [];
    },

    async listEscolasComContagemAtivos(usuarioId: string, filtros?: ListEscolasFiltersDTO): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await escolaRepository.listComContagemAtivos(usuarioId, filtros);
        if (error) throw error;

        return (data || []).map((escola: Record<string, any>) => ({
            ...escola,
            passageiros_ativos_count: escola.passageiros?.[0]?.count || 0,
        }));
    },

    async toggleAtivo(escolaId: string, novoStatus: boolean): Promise<boolean> {
        const { error } = await escolaRepository.updateAtivo(escolaId, novoStatus);

        if (error) throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} a escola.`);

        // --- LOG DE AUDITORIA ---
        const { data: e } = await escolaRepository.getUsuarioIdAndNome(escolaId);
        if (e) {
            historicoService.log({
                usuario_id: e.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.ESCOLA,
                entidade_id: escolaId,
                acao: AtividadeAcao.ESCOLA_STATUS,
                descricao: `Escola ${e.nome} foi ${novoStatus ? 'ATIVADA' : 'DESATIVADO'}.`,
                meta: { ativo: novoStatus }
            });
        }

        return novoStatus;
    },

    async countListEscolasByUsuario(usuarioId: string): Promise<number> {
        const { count, error } = await escolaRepository.countByUsuario(usuarioId);

        if (error) throw new Error(error.message || "Erro ao contar escolas");
        return count || 0;
    },
};
