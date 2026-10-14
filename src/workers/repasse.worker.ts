import { Job, Worker } from "bullmq";
import { logger } from "../config/logger.js";
import { redisConfig } from "../config/redis.js";
import { QUEUE_NAME_REPASSE, RepasseJobData } from "../queues/repasse.queue.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { paymentService } from "../services/payments/payment.service.js";

import { StatusRepasseEnum } from "../types/enums.js";
import { FINANCEIRO_CONFIG } from "../config/constants.js";

export const repasseWorker = new Worker<RepasseJobData>(
    QUEUE_NAME_REPASSE,
    async (job: Job<RepasseJobData>) => {
        const { repasseId, cobrancaId, chavePix: fallbackChavePix, valorLiquido } = job.data;
        logger.info({ jobId: job.id, repasseId, cobrancaId }, "[RepasseWorker] Iniciando saque do repasse...");

        const repasse = await cobrancaRepasseRepository.getByCobrancaId(cobrancaId);
        if (!repasse) {
            throw new Error(`Registro de repasse não encontrado para cobrança ${cobrancaId}`);
        }

        if (repasse.status_repasse === StatusRepasseEnum.SUCESSO) {
            logger.info({ repasseId, cobrancaId }, "[RepasseWorker] Repasse já foi liquidado anteriormente");
            return;
        }

        if (repasse.saque_provedor_id || repasse.end_to_end_id_out) {
            logger.info({ repasseId, cobrancaId }, "[RepasseWorker] Saque já emitido previamente no provedor. Pulando transferência e finalizando.");
            await cobrancaRepasseRepository.update(repasse.id, {
                status_repasse: StatusRepasseEnum.SUCESSO,
                data_repasse_motorista: repasse.data_repasse_motorista || new Date().toISOString(),
                ultimo_erro: null
            });
            const { cobrancaPagamentoService } = await import("../services/cobranca-pagamento.service.js");
            await cobrancaPagamentoService.registrarPagamentoAutomatico(cobrancaId, undefined, Number(repasse.valor_bruto));
            return;
        }

        if (!repasse.motorista_id) {
            throw new Error(`Repasse ${repasse.id} não possui motorista_id vinculado`);
        }

        const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(repasse.motorista_id);
        const chavePixEfetiva = motoristaConfig.chave_pix_repasse || fallbackChavePix;

        if (!chavePixEfetiva) {
            throw new Error(`Motorista ${repasse.motorista_id} não possui chave Pix cadastrada para repasse`);
        }

        await cobrancaRepasseRepository.update(repasse.id, {
            status_repasse: StatusRepasseEnum.PROCESSANDO,
            tentativas: (repasse.tentativas || 0) + 1
        });

        const valorEmCentavos = Math.round(valorLiquido * 100);

        const { data: cobranca } = await cobrancaRepository.getByIdBasic(cobrancaId);
        const encargosCentavos = cobranca
            ? Math.max(0, Math.round((Number(repasse.valor_bruto) - Number(cobranca.valor)) * 100))
            : 0;

        const saldoSubcontaReais = await paymentService.getSubaccountBalance(chavePixEfetiva);
        const saldoSubcontaCentavos = Math.round(saldoSubcontaReais * 100);
        const diferencaSaldoCentavos = Math.max(0, valorEmCentavos - saldoSubcontaCentavos);

        const diferencaCentavos = (!job.data.creditoEncargosRealizado && encargosCentavos > 0)
            ? Math.max(encargosCentavos, diferencaSaldoCentavos)
            : diferencaSaldoCentavos;

        if (diferencaCentavos > 0) {
            logger.info({ repasseId, chavePix: chavePixEfetiva, diferencaCentavos }, "[RepasseWorker] Creditando encargos de atraso na subconta...");
            const creditRes = await paymentService.creditSubaccount(chavePixEfetiva, diferencaCentavos);
            if (!creditRes.success) {
                const errorMsg = creditRes.error || "Falha ao creditar encargos na subconta";
                const isLastAttempt = job.attemptsMade >= ((job.opts.attempts || FINANCEIRO_CONFIG.REPASSE_MAX_TENTATIVAS) - 1);
                await cobrancaRepasseRepository.update(repasse.id, {
                    status_repasse: isLastAttempt ? StatusRepasseEnum.FALHA : StatusRepasseEnum.PENDENTE,
                    ultimo_erro: errorMsg
                });
                logger.error({ repasseId, error: errorMsg }, "[RepasseWorker] Falha ao creditar subconta antes do saque");

                if (isLastAttempt) {
                    const { telegramService } = await import("../services/telegram.service.js");
                    const alertMsg = `⚠️ <b>ALERTA CRÍTICO: Falha no Repasse Pix (Crédito Interno)</b>\n\n` +
                        `<b>ID Repasse:</b> <code>${repasse.id}</code>\n` +
                        `<b>Motorista ID:</b> <code>${repasse.motorista_id}</code>\n` +
                        `<b>Valor Líquido:</b> R$ ${valorLiquido.toFixed(2)}\n` +
                        `<b>Chave Pix:</b> <code>${chavePixEfetiva}</code>\n` +
                        `<b>Motivo:</b> ${errorMsg}\n\n` +
                        `👉 Acesse o painel de Repasses no Admin para verificar e retentar.`;
                    telegramService.sendMessage(alertMsg).catch((tErr) => {
                        logger.warn({ error: tErr }, "[RepasseWorker] Falha ao enviar alerta no Telegram");
                    });
                }

                throw new Error(errorMsg);
            }

            await job.updateData({
                ...job.data,
                creditoEncargosRealizado: true
            });
        }

        const withdrawRes = await paymentService.withdrawFromSubaccount(chavePixEfetiva, valorEmCentavos);

        if (!withdrawRes.success) {
            const errorMsg = withdrawRes.error || "Falha no saque da subconta";
            const isLastAttempt = job.attemptsMade >= ((job.opts.attempts || FINANCEIRO_CONFIG.REPASSE_MAX_TENTATIVAS) - 1);
            await cobrancaRepasseRepository.update(repasse.id, {
                status_repasse: isLastAttempt ? StatusRepasseEnum.FALHA : StatusRepasseEnum.PENDENTE,
                ultimo_erro: errorMsg
            });
            logger.error({ repasseId, error: errorMsg }, "[RepasseWorker] Falha ao liquidar saque");

            if (isLastAttempt) {
                const { telegramService } = await import("../services/telegram.service.js");
                const alertMsg = `⚠️ <b>ALERTA CRÍTICO: Falha no Repasse Pix</b>\n\n` +
                    `<b>ID Repasse:</b> <code>${repasse.id}</code>\n` +
                    `<b>Motorista ID:</b> <code>${repasse.motorista_id}</code>\n` +
                    `<b>Valor Líquido:</b> R$ ${valorLiquido.toFixed(2)}\n` +
                    `<b>Chave Pix:</b> <code>${chavePixEfetiva}</code>\n` +
                    `<b>Motivo:</b> ${errorMsg}\n\n` +
                    `👉 Acesse o painel de Repasses no Admin para verificar e retentar.`;
                telegramService.sendMessage(alertMsg).catch((tErr) => {
                    logger.warn({ error: tErr }, "[RepasseWorker] Falha ao enviar alerta no Telegram");
                });
            }

            throw new Error(errorMsg);
        }

        await cobrancaRepasseRepository.update(repasse.id, {
            status_repasse: StatusRepasseEnum.SUCESSO,
            saque_provedor_id: withdrawRes.transactionId || null,
            end_to_end_id_out: withdrawRes.endToEndId || null,
            data_repasse_motorista: new Date().toISOString(),
            ultimo_erro: null
        });

        const { cobrancaPagamentoService } = await import("../services/cobranca-pagamento.service.js");
        await cobrancaPagamentoService.registrarPagamentoAutomatico(cobrancaId, undefined, Number(repasse.valor_bruto));

        logger.info({ repasseId, cobrancaId }, "[RepasseWorker] Repasse liquidado e cobrança baixada com sucesso");
    },
    {
        connection: redisConfig,
        concurrency: 1
    }
);

repasseWorker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, "[RepasseWorker] Job falhou definitivamente ou aguarda retry");
});

repasseWorker.on("error", (err) => {
    logger.error({ error: err.message }, "[RepasseWorker] Erro interno ou de conexão do worker");
});
