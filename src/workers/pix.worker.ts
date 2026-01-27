import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PixJobData, QUEUE_NAME_PIX } from '../queues/pix.queue.js';
import { interService } from '../services/inter.service.js';

/**
 * Worker responsável por registrar PIX na API do Banco Inter de forma assíncrona.
 */
export const pixWorker = new Worker<PixJobData>(
    QUEUE_NAME_PIX,
    async (job: Job<PixJobData>) => {
        const { cobrancaId, valor, cpf, nome, dataVencimento } = job.data;
        logger.info({ jobId: job.id, cobrancaId, valor, dataVencimento }, "[PixWorker] 🚀 Iniciando registro de PIX (cobv)");

        try {
            // Chamar API do Inter
            const pixResult = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                cobrancaId,
                valor,
                cpf,
                nome,
                dataVencimento
            });

            logger.info({ jobId: job.id, cobrancaId, txid: pixResult.interTransactionId }, "[PixWorker] Inter API respondeu com sucesso. Salvando no banco...");

            // Atualizar banco de dados com os dados do PIX gerado
            const { error } = await supabaseAdmin
                .from("cobrancas")
                .update({
                    txid_pix: pixResult.interTransactionId,
                    qr_code_payload: pixResult.qrCodePayload,
                    url_qr_code: pixResult.location
                })
                .eq("id", cobrancaId);

            if (error) {
                logger.error({ error, cobrancaId, jobId: job.id }, "❌ [PixWorker] Erro crítico ao salvar dados do PIX no banco");
                throw error;
            }
            
            logger.info({ jobId: job.id, cobrancaId, txid: pixResult.interTransactionId }, "✅ [PixWorker] PIX registrado e salvo com sucesso");

        } catch (error: any) {
            logger.error({ 
                jobId: job.id, 
                cobrancaId,
                error: error.message,
                attempt: job.attemptsMade + 1
            }, "❌ [PixWorker] Falha no registro do PIX");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 5, // Limite de 5 requisições simultâneas ao Inter (respeitar Rate Limit)
        limiter: {
             max: 20, 
             duration: 1000 // Máximo 20 reqs/s (conservador)
        }
    }
);
