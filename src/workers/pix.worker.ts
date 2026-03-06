import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { supabaseAdmin } from '../config/supabase.js';
import { PixJobData, QUEUE_NAME_PIX } from '../queues/pix.queue.js';
import { paymentService } from '../services/payment.service.js';

/**
 * Worker responsável por registrar PIX com vencimento no provedor configurado.
 */
export const pixWorker = new Worker<PixJobData>(
    QUEUE_NAME_PIX,
    async (job: Job<PixJobData>) => {
        const { cobrancaId, valor, cpf, nome, dataVencimento } = job.data;
        logger.info({ jobId: job.id, cobrancaId, valor, dataVencimento }, "[PixWorker] 🚀 Iniciando registro de PIX (cobv)");

        try {
            // Chamar API do Provedor
            const provider = paymentService.getProvider();
            
            // O txid vem do job data (é estável para retries, mas muda se o valor/vencimento mudar no addToPixQueue)
            const txidToUse = job.data.txid || job.data.cobrancaId;

            const pixResult = await provider.criarCobrancaComVencimento({
                cobrancaId: txidToUse,
                valor,
                cpf,
                nome,
                dataVencimento
            });

            logger.info({ jobId: job.id, cobrancaId, txid: pixResult.gatewayTransactionId }, "[PixWorker] API respondeu com sucesso. Salvando no banco...");

            // Atualizar banco de dados com os dados do PIX gerado
            const { error } = await supabaseAdmin
                .from("cobrancas")
                .update({
                    gateway_txid: pixResult.gatewayTransactionId,
                    qr_code_payload: pixResult.qrCodePayload,
                    location_url: pixResult.location
                })
                .eq("id", cobrancaId);

            if (error) {
                logger.error({ error, cobrancaId, jobId: job.id }, "❌ [PixWorker] Erro crítico ao salvar dados do PIX no banco");
                throw error;
            }
            
            logger.info({ jobId: job.id, cobrancaId, txid: pixResult.gatewayTransactionId }, "✅ [PixWorker] PIX registrado e salvo com sucesso");

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
        concurrency: 5, // Limite de requisições simultâneas para respeitar Rate Limits do Provedor
        limiter: {
             max: 20, 
             duration: 1000 // Máximo de requisições por intervalo (Segurança)
        }
    }
);
