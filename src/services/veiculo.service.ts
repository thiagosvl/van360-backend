import { veiculoRepository } from "../repositories/veiculo.repository.js";
import { CreateVeiculoDTO, ListVeiculosFiltersDTO, UpdateVeiculoDTO, Veiculo, VeiculoComContagem } from "../types/dtos/veiculo.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { cleanString } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";

// Helper Methods
const _prepareVeiculoData = (data: Partial<CreateVeiculoDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
        prepared.ativo = true;
    }

    if (data.placa) prepared.placa = cleanString(data.placa).toUpperCase();
    if (data.marca !== undefined) prepared.marca = data.marca ? cleanString(data.marca) : null;
    if (data.modelo !== undefined) prepared.modelo = data.modelo ? cleanString(data.modelo) : null;
    if (data.ano !== undefined) prepared.ano = data.ano;
    if (data.capacidade !== undefined) prepared.capacidade = data.capacidade;
    if (data.ativo !== undefined) prepared.ativo = data.ativo;

    return prepared;
};

export const veiculoService = {
    async createVeiculo(data: CreateVeiculoDTO): Promise<Veiculo> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");
        if (!data.placa) throw new Error("Placa é obrigatória");

        const veiculoData = _prepareVeiculoData(data, data.usuario_id, false);

        const { data: inserted, error } = await veiculoRepository.insert(veiculoData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: inserted.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.VEICULO,
            entidade_id: inserted.id,
            acao: AtividadeAcao.VEICULO_CRIADO,
            descricao: `Novo veículo ${inserted.placa} (${inserted.modelo || 'Sem modelo'}) cadastrado.`,
            meta: { placa: inserted.placa, modelo: inserted.modelo }
        });

        return inserted as Veiculo;
    },

    async updateVeiculo(id: string, data: UpdateVeiculoDTO): Promise<Veiculo> {
        if (!id) throw new Error("ID do veículo é obrigatório");

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

    async getVeiculo(id: string): Promise<Veiculo | null> {
        const { data, error } = await veiculoRepository.getById(id);
        if (error) throw error;
        return data as Veiculo;
    },

    async listVeiculos(
        usuarioId: string,
        filtros?: ListVeiculosFiltersDTO
    ): Promise<Veiculo[]> {
        const { data, error } = await veiculoRepository.list(usuarioId, filtros);
        if (error) throw error;

        return (data || []) as Veiculo[];
    },

    async listVeiculosComContagemAtivos(usuarioId: string, filtros?: ListVeiculosFiltersDTO): Promise<VeiculoComContagem[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await veiculoRepository.listComContagemAtivos(usuarioId, filtros);
        if (error) throw error;

        return (data || []).map((veiculo: Record<string, any>) => ({
            ...veiculo,
            passageiros_ativos_count: veiculo.passageiros?.[0]?.count || 0,
        })) as VeiculoComContagem[];
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

    async countListVeiculosByUsuario(usuarioId: string): Promise<number> {
        const { count, error } = await veiculoRepository.countByUsuario(usuarioId);

        if (error) throw new Error(error.message || "Erro ao contar veículos");
        return count || 0;
    },
};
