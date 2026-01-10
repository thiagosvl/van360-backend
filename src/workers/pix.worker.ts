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
        logger.debug({ jobId: job.id, cobrancaId }, "[Worker] Registrando PIX na API do Inter...");

        try {
            // Chamar API do Inter
            const pixResult = await interService.criarCobrancaComVencimentoPix(supabaseAdmin, {
                cobrancaId,
                valor,
                cpf,
                nome,
                dataVencimento
            });

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
                logger.error({ error, cobrancaId }, "[Worker] Erro ao salvar dados do PIX no banco");
                throw error; // Falha o job para tentar de novo (ou investigar)
            }
            
            logger.info({ jobId: job.id, cobrancaId, txid: pixResult.interTransactionId }, "[Worker] PIX registrado com sucesso");

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] PIX Job Failed");
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
