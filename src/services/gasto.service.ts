import { gastoRepository } from "../repositories/gasto.repository.js";
import { CreateGastoDTO, ListGastosFiltersDTO, UpdateGastoDTO } from "../types/dtos/gasto.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString } from "../utils/string.utils.js";
import { historicoService } from "./historico.service.js";
import { toPersistenceString, parseLocalDate } from "../utils/date.utils.js";

// Helper Methods
const _prepareGastoData = (data: Partial<CreateGastoDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
    }

    if (data.valor !== undefined) prepared.valor = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;
    if (data.data !== undefined) prepared.data = data.data ? toPersistenceString(data.data) : null;
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

const addMonthsFinancial = (dateStr: string, monthsToAdd: number): string => {
    const d = parseLocalDate(dateStr);
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();

    const targetDate = new Date(year, month + monthsToAdd, 1);
    const maxDays = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(day, maxDays);
    targetDate.setDate(targetDay);
    return toPersistenceString(targetDate);
};

export const gastoService = {
    async createGasto(data: CreateGastoDTO): Promise<any> {
        if (!data.usuario_id) throw new Error("Usuário obrigatório");

        if (data.parcelado && data.parcelas && data.parcelas >= 2) {
            const parcelasCriadas: any[] = [];
            const valorTotalCentavos = Math.round(Number(data.valor) * 100);
            const valorParcelaCentavos = Math.floor(valorTotalCentavos / data.parcelas);
            const restoCentavos = valorTotalCentavos % data.parcelas;

            for (let i = 1; i <= data.parcelas; i++) {
                const valorParcela = (valorParcelaCentavos + (i === 1 ? restoCentavos : 0)) / 100;
                const dataParcela = addMonthsFinancial(toPersistenceString(data.data), i - 1);
                const descricaoParcela = data.descricao
                    ? `${cleanString(data.descricao)} ${i}/${data.parcelas}`
                    : `Parcela ${i}/${data.parcelas}`;

                const parcelaGastoData = _prepareGastoData(
                    {
                        ...data,
                        valor: valorParcela,
                        data: dataParcela,
                        descricao: descricaoParcela,
                    },
                    data.usuario_id,
                    false
                );

                const { data: inserted, error } = await gastoRepository.insert(parcelaGastoData);
                if (error) throw error;

                parcelasCriadas.push(inserted);
            }

            // --- LOG DE AUDITORIA ÚNICO ---
            const valorTotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(data.valor));
            const valorPrimeiraParcelaFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcelasCriadas[0].valor);

            historicoService.log({
                usuario_id: data.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.GASTO,
                entidade_id: parcelasCriadas[0].id,
                acao: AtividadeAcao.GASTO_REGISTRADO,
                descricao: `Gasto parcelado de ${valorTotalFormatado} registrado em ${data.categoria} (${data.parcelas}x de ${valorPrimeiraParcelaFormatado}).`,
                meta: {
                    valor_total: Number(data.valor),
                    valor_parcela: parcelasCriadas[0].valor,
                    parcelas: data.parcelas,
                    categoria: data.categoria,
                    descricao: data.descricao,
                    parcelas_ids: parcelasCriadas.map(p => p.id)
                }
            });

            return parcelasCriadas[0];
        }

        const gastoData = _prepareGastoData(data, data.usuario_id, false);

        const { data: inserted, error } = await gastoRepository.insert(gastoData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: inserted.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.GASTO,
            entidade_id: inserted.id,
            acao: AtividadeAcao.GASTO_REGISTRADO,
            descricao: `Gasto de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inserted.valor)} registrado em ${inserted.categoria}.`,
            meta: { valor: inserted.valor, categoria: inserted.categoria, descricao: inserted.descricao }
        });

        return inserted;
    },

    async updateGasto(id: string, data: UpdateGastoDTO): Promise<any> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gastoData = _prepareGastoData(data, undefined, true);

        const { data: updated, error } = await gastoRepository.update(id, gastoData);
        if (error) throw error;

        // --- LOG DE AUDITORIA ---
        historicoService.log({
            usuario_id: updated.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.GASTO,
            entidade_id: id,
            acao: AtividadeAcao.GASTO_EDITADO,
            descricao: `Registro de gasto (${updated.categoria}) foi atualizado.`,
            meta: { valor: updated.valor, categoria: updated.categoria, campos: Object.keys(data) }
        });

        return updated;
    },

    async deleteGasto(id: string): Promise<void> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gasto = await this.getGasto(id);

        if (gasto?.id) {
            const { error } = await gastoRepository.delete(id);
            if (error) throw error;

            // --- LOG DE AUDITORIA ---
            historicoService.log({
                usuario_id: gasto.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.GASTO,
                entidade_id: id,
                acao: AtividadeAcao.GASTO_EXCLUIDO,
                descricao: `Gasto de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(gasto.valor)} (${gasto.categoria}) removido.`,
                meta: { valor: gasto.valor, categoria: gasto.categoria, backup: gasto }
            });
        }
    },

    async getGasto(id: string): Promise<any> {
        const { data, error } = await gastoRepository.getById(id);
        if (error) throw error;
        return data;
    },

    async listGastos(
        usuarioId: string,
        filtros?: ListGastosFiltersDTO
    ): Promise<any[]> {
        if (!usuarioId) throw new Error("Usuário obrigatório");

        const { data, error } = await gastoRepository.list(usuarioId, filtros);
        if (error) throw error;

        return data || [];
    },

};
