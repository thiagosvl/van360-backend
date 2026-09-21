import { AppError } from "../errors/AppError.js";
import { logger } from "../config/logger.js";
import { reciboAnualRepository, ReciboAnual } from "../repositories/recibo-anual.repository.js";
import { passageiroRepository } from "../repositories/passageiro.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { userRepository } from "../repositories/user.repository.js";
import { receiptService, AnnualReceiptMonthItem, AnnualReceiptData } from "./receipt.service.js";
import { CobrancaStatus, TipoResponsavel } from "../types/enums.js";
import { getMonthNameBR } from "../utils/date.utils.js";
import { getDriverDisplayName } from "../utils/format.js";

export const reciboAnualService = {
    async obterOuGerarReciboAnual(passageiroId: string, ano: number, usuarioId?: string): Promise<ReciboAnual | null> {
        logger.info({ passageiroId, ano, usuarioId }, "[reciboAnualService.obterOuGerarReciboAnual] Verificando recibo anual");

        const passageiro = await passageiroRepository.getByIdCompleto(passageiroId);
        if (!passageiro) {
            throw new AppError("Passageiro não encontrado.", 404);
        }

        if (passageiro.isento) {
            await this.removerReciboAnualSeExistir(passageiroId, ano);
            return null;
        }

        if (!passageiro.data_inicio_cobranca || !passageiro.data_fim_cobranca) {
            await this.removerReciboAnualSeExistir(passageiroId, ano);
            return null;
        }

        const dataInicio = new Date(passageiro.data_inicio_cobranca);
        const dataFim = new Date(passageiro.data_fim_cobranca);

        const anoInicio = dataInicio.getUTCFullYear();
        const anoFim = dataFim.getUTCFullYear();

        if (ano < anoInicio || ano > anoFim) {
            await this.removerReciboAnualSeExistir(passageiroId, ano);
            return null;
        }

        const mesInicio = ano === anoInicio ? dataInicio.getUTCMonth() + 1 : 1;
        const mesFim = ano === anoFim ? dataFim.getUTCMonth() + 1 : 12;

        const mesesEsperados: number[] = [];
        for (let m = mesInicio; m <= mesFim; m++) {
            mesesEsperados.push(m);
        }

        const { data: cobrancas, error: cobrancasError } = await cobrancaRepository.getByPassageiroEAno(passageiroId, ano);

        if (cobrancasError) {
            logger.error({ error: cobrancasError.message, passageiroId, ano }, "[reciboAnualService] Erro ao buscar cobranças");
            throw new AppError("Erro ao consultar cobranças do passageiro.", 500);
        }

        const cobrancasPagas = (cobrancas || []).filter((c) => c.status === CobrancaStatus.PAGO);
        const mesesPagosMap = new Map<number, typeof cobrancasPagas[0]>();

        for (const c of cobrancasPagas) {
            if (c.mes) {
                mesesPagosMap.set(c.mes, c);
            }
        }

        const todosMesesPagos = mesesEsperados.every((m) => {
            const cob = mesesPagosMap.get(m);
            if (!cob) return false;
            const isParcial = cob.valor_pago !== null && Number(cob.valor_pago) < Number(cob.valor);
            return !isParcial;
        });
        if (!todosMesesPagos) {
            logger.warn({ passageiroId, ano, esperados: mesesEsperados.length, pagos: mesesPagosMap.size }, "[reciboAnualService] Ano ainda não quitado");
            await this.removerReciboAnualSeExistir(passageiroId, ano);
            return null;
        }

        const itensMeses: AnnualReceiptMonthItem[] = mesesEsperados.map((m) => {
            const cob = mesesPagosMap.get(m)!;
            return {
                mes: m,
                mesNome: getMonthNameBR(m),
                dataVencimento: cob.data_vencimento,
                dataPagamento: cob.data_pagamento,
                valor: Number(cob.valor_pago || cob.valor),
                pago: true
            };
        });

        const totalPago = itensMeses.reduce((acc, curr) => acc + curr.valor, 0);
        const quantidadeMesesEsperados = mesesEsperados.length;

        const { data: existente } = await reciboAnualRepository.findByPassageiroEAno(passageiroId, ano);
        if (existente) {
            const mesmaQuantidade = existente.quantidade_meses === quantidadeMesesEsperados;
            const mesmoTotal = Math.abs(Number(existente.total_pago) - totalPago) < 0.01;

            if (mesmaQuantidade && mesmoTotal && existente.recibo_url) {
                logger.info({ passageiroId, ano, reciboId: existente.id }, "[reciboAnualService] Recibo existente é válido e compatível");
                return existente;
            }

            logger.info({
                passageiroId,
                ano,
                reciboId: existente.id,
                qtdAntiga: existente.quantidade_meses,
                qtdNova: quantidadeMesesEsperados,
                totalAntigo: existente.total_pago,
                totalNovo: totalPago
            }, "[reciboAnualService] Recibo existente desatualizado. Regenerando novo recibo atualizado");

            if (existente.recibo_url) {
                await receiptService.deleteReceipt(existente.recibo_url);
            }
        }

        const { data: motorista } = await userRepository.getById(passageiro.usuario_id);

        const responsaveisLista = Array.isArray(passageiro.responsaveis) ? passageiro.responsaveis : [];
        const respPrincipalObj = responsaveisLista.find((r: { tipo: string }) => r.tipo === TipoResponsavel.PRINCIPAL) || responsaveisLista[0];
        const respDados = respPrincipalObj?.responsavel;
        const responsavelReal = Array.isArray(respDados) ? respDados[0] : respDados;

        const dadosRecibo: AnnualReceiptData = {
            passageiroId,
            ano,
            motoristaNome: motorista?.nome || "Transporte Escolar",
            motoristaRazaoSocial: motorista?.razao_social,
            motoristaTelefone: motorista?.telefone,
            motoristaDocumento: motorista?.cpfcnpj,
            motoristaLogoUrl: motorista?.logo_url,
            responsavelNome: responsavelReal?.nome || "Responsável Financeiro",
            responsavelDocumento: responsavelReal?.cpf,
            passageiroNome: passageiro.nome,
            escolaNome: (passageiro.escola as { nome?: string } | null)?.nome,
            turno: passageiro.turno,
            meses: itensMeses,
            totalPago,
            quantidadeMeses: quantidadeMesesEsperados
        };

        const reciboUrl = await receiptService.generateAnnualReceipt(dadosRecibo);
        if (!reciboUrl) {
            throw new AppError("Não foi possível gerar a imagem do recibo anual.", 500);
        }

        const resultado: ReciboAnual = existente
            ? await (async () => {
                const { data: atualizado, error: updateError } = await reciboAnualRepository.update(existente.id, {
                    recibo_url: reciboUrl,
                    total_pago: totalPago,
                    quantidade_meses: quantidadeMesesEsperados,
                    updated_at: new Date().toISOString()
                });
                if (updateError || !atualizado) {
                    logger.error({ error: updateError?.message, passageiroId, ano }, "[reciboAnualService] Erro ao atualizar recibo anual");
                    throw new AppError("Erro ao atualizar recibo anual.", 500);
                }
                return atualizado;
            })()
            : await (async () => {
                const { data: criado, error: insertError } = await reciboAnualRepository.insert({
                    passageiro_id: passageiroId,
                    motorista_id: passageiro.usuario_id,
                    ano,
                    recibo_url: reciboUrl,
                    total_pago: totalPago,
                    quantidade_meses: quantidadeMesesEsperados
                });
                if (insertError || !criado) {
                    logger.error({ error: insertError?.message, passageiroId, ano }, "[reciboAnualService] Erro ao persistir recibo anual no banco");
                    throw new AppError("Erro ao salvar recibo anual.", 500);
                }
                return criado;
            })();

        logger.info({ id: resultado.id, passageiroId, ano, meses: quantidadeMesesEsperados }, "[reciboAnualService] Recibo anual finalizado com sucesso");
        return resultado;
    },

    async removerReciboAnualSeExistir(passageiroId: string, ano: number): Promise<void> {
        logger.info({ passageiroId, ano }, "[reciboAnualService.removerReciboAnualSeExistir] Verificando remoção de recibo anual");

        const { data: existente } = await reciboAnualRepository.findByPassageiroEAno(passageiroId, ano);
        if (!existente) return;

        if (existente.recibo_url) {
            await receiptService.deleteReceipt(existente.recibo_url);
        }

        await reciboAnualRepository.deleteByPassageiroEAno(passageiroId, ano);
        logger.info({ passageiroId, ano }, "[reciboAnualService] Recibo anual removido com sucesso");
    }
};
