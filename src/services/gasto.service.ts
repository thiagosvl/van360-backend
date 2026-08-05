import { gastoRepository } from "../repositories/gasto.repository.js";
import { gastoCategoriaRepository } from "../repositories/gasto-categoria.repository.js";
import { CreateGastoDTO, ListGastosFiltersDTO, UpdateGastoDTO } from "../types/dtos/gasto.dto.js";
import { AtividadeAcao, AtividadeEntidadeTipo, GastoEscopoAcao, GastoTipoCalculoParcela } from "../types/enums.js";
import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString } from "../utils/string.utils.js";
import { AppError } from "../errors/AppError.js";
import { historicoService } from "./historico.service.js";
import { toPersistenceString, parseLocalDate } from "../utils/date.utils.js";
import { supabaseAdmin } from "../config/supabase.js";

const _validarObterSlugCategoria = async (categoria: string, usuarioId: string): Promise<string> => {
    const catsRes = await gastoCategoriaRepository.list(usuarioId);
    if (catsRes.error) throw new Error("Erro ao validar categoria.");
    
    const categorias = catsRes.data || [];
    
    const matchSlug = categorias.find(c => c.slug.toLowerCase() === categoria.toLowerCase());
    if (matchSlug) {
        return matchSlug.slug;
    }
    
    const matchNome = categorias.find(c => c.nome.toLowerCase() === categoria.toLowerCase());
    if (matchNome) {
        return matchNome.slug;
    }
    
    throw new Error(`Categoria "${categoria}" inválida ou não cadastrada.`);
};

const _prepareGastoData = (data: Partial<CreateGastoDTO>, usuarioId?: string, isUpdate: boolean = false): Record<string, unknown> => {
    const prepared: Record<string, unknown> = {};

    if (!isUpdate && usuarioId) {
        prepared.usuario_id = usuarioId;
    }

    if (data.valor !== undefined) {
        const val = typeof data.valor === "string" ? moneyToNumber(data.valor) : data.valor;
        if (val < 0) throw new AppError("Valor do gasto não pode ser negativo", 400);
        prepared.valor = val;
    }
    if (data.data !== undefined) prepared.data = data.data ? toPersistenceString(data.data) : null;
    if (data.descricao !== undefined) {
        const str = data.descricao ? cleanString(data.descricao) : null;
        prepared.descricao = str ? str.replace(/\s+\d+\/\d+$/, '').trim() || null : null;
    }
    if (data.categoria !== undefined) prepared.categoria = data.categoria;
    
    if (data.veiculo_id !== undefined) {
        prepared.veiculo_id = (data.veiculo_id === "none" || !data.veiculo_id) ? null : data.veiculo_id;
    }

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

        data.categoria = await _validarObterSlugCategoria(data.categoria, data.usuario_id);

        if (data.parcelado && data.parcelas && data.parcelas >= 2) {
            const parcelasCriadas: any[] = [];
            const parcelamentoId = crypto.randomUUID();
            const modoCalculo = data.tipo_calculo_parcela || GastoTipoCalculoParcela.TOTAL;

            let valorTotalGasto: number;
            let valorBaseCentavos = 0;
            let restoCentavos = 0;

            if (modoCalculo === GastoTipoCalculoParcela.PARCELA) {
                const valorInformado = Number(data.valor);
                valorTotalGasto = valorInformado * data.parcelas;
            } else {
                valorTotalGasto = Number(data.valor);
                const valorTotalCentavos = Math.round(valorTotalGasto * 100);
                valorBaseCentavos = Math.floor(valorTotalCentavos / data.parcelas);
                restoCentavos = valorTotalCentavos % data.parcelas;
            }

            const descPura = data.descricao ? cleanString(data.descricao).replace(/\s+\d+\/\d+$/, '').trim() : null;

            for (let i = 1; i <= data.parcelas; i++) {
                let valorParcela: number;
                if (modoCalculo === GastoTipoCalculoParcela.PARCELA) {
                    valorParcela = Number(data.valor);
                } else {
                    valorParcela = (valorBaseCentavos + (i === 1 ? restoCentavos : 0)) / 100;
                }

                const dataParcela = addMonthsFinancial(toPersistenceString(data.data), i - 1);

                const parcelaGastoData = {
                    ..._prepareGastoData(
                        {
                            ...data,
                            valor: valorParcela,
                            data: dataParcela,
                            descricao: descPura || undefined,
                        },
                        data.usuario_id,
                        false
                    ),
                    parcelamento_id: parcelamentoId,
                    numero_parcela: i,
                    total_parcelas: data.parcelas,
                };

                const { data: inserted, error } = await gastoRepository.insert(parcelaGastoData);
                if (error) throw error;

                parcelasCriadas.push(inserted);
            }

            const valorTotalFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorTotalGasto);
            const valorPrimeiraParcelaFormatado = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(parcelasCriadas[0].valor);

            historicoService.log({
                usuario_id: data.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.GASTO,
                entidade_id: parcelasCriadas[0].id,
                acao: AtividadeAcao.GASTO_REGISTRADO,
                descricao: `Gasto parcelado de ${valorTotalFormatado} registrado em ${data.categoria} (${data.parcelas}x de ${valorPrimeiraParcelaFormatado}).`,
                meta: {
                    valor_total: valorTotalGasto,
                    valor_parcela: parcelasCriadas[0].valor,
                    parcelas: data.parcelas,
                    categoria: data.categoria,
                    descricao: descPura,
                    parcelas_ids: parcelasCriadas.map(p => p.id)
                }
            });

            return parcelasCriadas[0];
        }

        const gastoData = _prepareGastoData(data, data.usuario_id, false);

        const { data: inserted, error } = await gastoRepository.insert(gastoData);
        if (error) throw error;

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

    async _recalcularTotalParcelas(parcelamentoId: string): Promise<void> {
        if (!parcelamentoId) return;

        const { data: parcelas, error } = await supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("parcelamento_id", parcelamentoId)
            .order("data", { ascending: true })
            .order("created_at", { ascending: true });

        if (error || !parcelas || parcelas.length === 0) return;

        const totalRestante = parcelas.length;

        if (totalRestante === 1) {
            const p = parcelas[0];
            const descBase = p.descricao ? p.descricao.replace(/\s+\d+\/\d+$/, '').trim() : null;
            await gastoRepository.update(p.id, {
                parcelamento_id: null,
                numero_parcela: null,
                total_parcelas: null,
                descricao: descBase || null,
            });
            return;
        }

        for (let i = 0; i < totalRestante; i++) {
            const p = parcelas[i];
            const novoNumero = i + 1;
            const descBase = p.descricao ? p.descricao.replace(/\s+\d+\/\d+$/, '').trim() : null;

            if (p.numero_parcela !== novoNumero || p.total_parcelas !== totalRestante || p.descricao !== descBase) {
                await gastoRepository.update(p.id, {
                    numero_parcela: novoNumero,
                    total_parcelas: totalRestante,
                    descricao: descBase || null,
                });
            }
        }
    },

    async updateGasto(id: string, data: UpdateGastoDTO, escopo: GastoEscopoAcao = GastoEscopoAcao.UNICA): Promise<any> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gastoExistente = await this.getGasto(id);
        if (!gastoExistente) throw new Error("Gasto não encontrado");

        if (data.categoria !== undefined) {
            data.categoria = await _validarObterSlugCategoria(data.categoria, gastoExistente.usuario_id);
        }

        const gastoData = _prepareGastoData(data, undefined, true);

        if (!gastoExistente.parcelamento_id || escopo === GastoEscopoAcao.UNICA) {
            const { data: updated, error } = await gastoRepository.update(id, gastoData);
            if (error) throw error;

            if (gastoExistente.parcelamento_id) {
                await this._recalcularTotalParcelas(gastoExistente.parcelamento_id);
            }

            historicoService.log({
                usuario_id: updated.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.GASTO,
                entidade_id: id,
                acao: AtividadeAcao.GASTO_EDITADO,
                descricao: `Registro de gasto (${updated.categoria}) foi atualizado.`,
                meta: { valor: updated.valor, categoria: updated.categoria, campos: Object.keys(data) }
            });

            return updated;
        }

        const minNumero = escopo === GastoEscopoAcao.FUTURAS ? (gastoExistente.numero_parcela || 1) : undefined;
        const baseNumero = escopo === GastoEscopoAcao.FUTURAS ? (gastoExistente.numero_parcela || 1) : 1;

        // Buscar todas as parcelas afetadas pelo escopo de alteracao em lote
        let queryAfetadas = supabaseAdmin
            .from("gastos")
            .select("*")
            .eq("parcelamento_id", gastoExistente.parcelamento_id);

        if (minNumero !== undefined) {
            queryAfetadas = queryAfetadas.gte("numero_parcela", minNumero);
        }

        const { data: parcelasAfetadas, error: errorAfetadas } = await queryAfetadas;
        if (errorAfetadas) throw errorAfetadas;

        const baseDateStr = gastoData.data ? (gastoData.data as string) : null;

        if (parcelasAfetadas && parcelasAfetadas.length > 0) {
            for (const p of parcelasAfetadas) {
                const payloadSingle = { ...gastoData };

                // Se a data foi fornecida, projeta a data mantendo o espacamento mensal original de cada parcela
                if (baseDateStr) {
                    const offsetMeses = (p.numero_parcela || 1) - baseNumero;
                    payloadSingle.data = addMonthsFinancial(baseDateStr, Math.max(0, offsetMeses));
                }

                await gastoRepository.update(p.id, payloadSingle);
            }
        }

        if (gastoExistente.parcelamento_id) {
            await this._recalcularTotalParcelas(gastoExistente.parcelamento_id);
        }

        const { data: updatedMain } = await gastoRepository.getById(id);

        historicoService.log({
            usuario_id: gastoExistente.usuario_id,
            entidade_tipo: AtividadeEntidadeTipo.GASTO,
            entidade_id: id,
            acao: AtividadeAcao.GASTO_EDITADO,
            descricao: `Parcelas do gasto (${gastoExistente.categoria}) foram atualizadas em lote (${escopo}).`,
            meta: { parcelamento_id: gastoExistente.parcelamento_id, escopo, registros_afetados: parcelasAfetadas?.length || 0 }
        });

        return updatedMain || gastoExistente;
    },

    async deleteGasto(id: string, escopo: GastoEscopoAcao = GastoEscopoAcao.UNICA): Promise<void> {
        if (!id) throw new Error("ID do gasto é obrigatório");

        const gasto = await this.getGasto(id);

        if (gasto?.id) {
            const parcelamentoId = gasto.parcelamento_id;

            if (!parcelamentoId || escopo === GastoEscopoAcao.UNICA) {
                const { error } = await gastoRepository.delete(id);
                if (error) throw error;
            } else if (escopo === GastoEscopoAcao.FUTURAS) {
                const { error } = await gastoRepository.deleteByParcelamento(parcelamentoId, gasto.numero_parcela);
                if (error) throw error;
            } else if (escopo === GastoEscopoAcao.TODAS) {
                const { error } = await gastoRepository.deleteByParcelamento(parcelamentoId);
                if (error) throw error;
            }

            if (parcelamentoId && escopo !== GastoEscopoAcao.TODAS) {
                await this._recalcularTotalParcelas(parcelamentoId);
            }

            historicoService.log({
                usuario_id: gasto.usuario_id,
                entidade_tipo: AtividadeEntidadeTipo.GASTO,
                entidade_id: id,
                acao: AtividadeAcao.GASTO_EXCLUIDO,
                descricao: `Gasto de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(gasto.valor)} (${gasto.categoria}) removido (${escopo}).`,
                meta: { valor: gasto.valor, categoria: gasto.categoria, escopo, parcelamento_id: parcelamentoId }
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
