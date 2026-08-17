import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { CreateVeiculoDTO, ListVeiculosFiltersDTO, UpdateVeiculoDTO, Veiculo, VeiculoComContagem } from "../types/dtos/veiculo.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { cleanString } from "../utils/string.utils.js";
import { limparPlaca } from "../utils/placa.utils.js";
import { historicoService } from "./historico.service.js";
import { AppError } from "../errors/AppError.js";

// Helper Methods
const _prepareVeiculoData = (data: Partial<CreateVeiculoDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
        prepared.ativo = true;
    }

    if (data.placa) prepared.placa = limparPlaca(data.placa);
    if (data.marca !== undefined) prepared.marca = data.marca ? cleanString(data.marca) : null;
    if (data.modelo !== undefined) prepared.modelo = data.modelo ? cleanString(data.modelo) : null;
    if (data.ativo !== undefined) prepared.ativo = data.ativo;

    return prepared;
};

export const veiculoService = {
    async createVeiculo(data: CreateVeiculoDTO): Promise<Veiculo> {
        if (!data.usuario_id) throw new AppError("Usuário obrigatório", 400);
        if (!data.placa) throw new AppError("Placa é obrigatória", 400);

        const veiculoData = _prepareVeiculoData(data, data.usuario_id, false);

        const { data: inserted, error } = await veiculoRepository.insert(veiculoData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: inserted.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.VEICULO,
            entidade_id: inserted.id,
            acao: AtividadeAcao.VEICULO_CRIADO,
            descricao: `Novo veículo ${inserted.placa} (${inserted.marca} ${inserted.modelo}) cadastrado.`,
            meta: { placa: inserted.placa, marca: inserted.marca, modelo: inserted.modelo }
        });

        return inserted as Veiculo;
    },

    async updateVeiculo(id: string, data: UpdateVeiculoDTO): Promise<Veiculo> {
        if (!id) throw new AppError("ID do veículo é obrigatório", 400);

        const veiculoData = _prepareVeiculoData(data, undefined, true);

        const { data: updated, error } = await veiculoRepository.update(id, veiculoData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: updated.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.VEICULO,
            entidade_id: id,
            acao: AtividadeAcao.VEICULO_EDITADO,
            descricao: `Dados do veículo ${updated.placa} foram atualizados.`,
            meta: { placa: updated.placa, campos: Object.keys(data) }
        });

        return updated as Veiculo;
    },

    async deleteVeiculo(id: string): Promise<void> {
        if (!id) throw new Error("ID do veículo é obrigatório");

        const veiculo = await this.getVeiculo(id);

        if (veiculo?.id) {
            const { error } = await veiculoRepository.delete(id);
            if (error) throw error;

            // --- LOG DE AUDITORIA ---
            historicoService.log({
                usuario_id: veiculo.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.VEICULO,
                entidade_id: id,
                acao: AtividadeAcao.VEICULO_EXCLUIDO,
                descricao: `Veículo ${veiculo.placa} foi excluído permanentemente do sistema.`,
                meta: { placa: veiculo.placa, backup: veiculo }
            });
        }
    },

    async getVeiculo(id: string, targetOwnerId?: string, assignedVeiculoId?: string): Promise<Veiculo | null> {
        const { data, error } = await veiculoRepository.getById(id);
        if (error) throw error;
        if (!data) throw new AppError("Veículo não encontrado", 404);

        if (targetOwnerId && data.usuario_id !== targetOwnerId) {
            throw new AppError("Acesso negado", 403);
        }

        if (assignedVeiculoId && data.id !== assignedVeiculoId) {
            throw new AppError("Acesso negado para este veículo", 403);
        }

        return data as Veiculo;
    },

    async listVeiculos(
        usuarioId: string,
        filtros?: ListVeiculosFiltersDTO
    ): Promise<any[]> {
        const { data, error } = await veiculoRepository.list(usuarioId, filtros);
        if (error) throw error;

        const list = data || [];
        if (filtros?.comContagem === "true") {
            return list.map((veiculo: Record<string, any>) => ({
                ...veiculo,
                passageiros_ativos_count: veiculo.passageiros?.[0]?.count || 0,
            }));
        }

        return list;
    },

    async toggleAtivo(veiculoId: string, novoStatus: boolean): Promise<boolean> {
        const { error } = await veiculoRepository.updateAtivo(veiculoId, novoStatus);

        if (error) {
            throw new Error(`Falha ao ${novoStatus ? "ativar" : "desativar"} o veículo.`);
        }

        // --- LOG DE AUDITORIA ---
        const { data: v } = await veiculoRepository.getUsuarioIdAndPlaca(veiculoId);
        if (v) {
            historicoService.log({
                usuario_id: v.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.VEICULO,
                entidade_id: veiculoId,
                acao: AtividadeAcao.VEICULO_STATUS,
                descricao: `Veículo ${v.placa} foi ${novoStatus ? 'ATIVADO' : 'DESATIVADO'}.`,
                meta: { ativo: novoStatus }
            });
        }

        return novoStatus;
    },
};
