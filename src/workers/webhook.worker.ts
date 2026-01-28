import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WEBHOOK, WebhookJobData } from '../queues/webhook.queue.js';
import { webhookRouterService } from '../services/webhook-router.service.js';

/**
 * Worker responsável por processar Webhooks (PIX)
 * Garante que o banco de dados seja atualizado com segurança e retry.
 */
export const webhookWorker = new Worker<WebhookJobData>(
    QUEUE_NAME_WEBHOOK,
    async (job: Job<WebhookJobData>) => {
        const { pagamento } = job.data;
        const { txid, endToEndId, valor } = pagamento;

        logger.info({ jobId: job.id, txid, endToEndId, valor }, "[WebhookWorker] 📥 Recebido evento de pagamento");

        try {
            // 1. Traduzir payload para o formato padrão
            const standardPayload = webhookRouterService.translate(job.data.origin, pagamento);

            // 2. Rotear para os handlers adequados
            const handled = await webhookRouterService.route(standardPayload);

            if (handled) {
                logger.info({ jobId: job.id, txid: standardPayload.gatewayTransactionId }, "✅ [WebhookWorker] Webhook processado com sucesso");
            } else {
                logger.warn({ jobId: job.id, txid: standardPayload.gatewayTransactionId }, "⚠️ [WebhookWorker] Webhook ignorado: Nenhuma cobrança correspondente encontrada");
            }

        } catch (error: any) {
            logger.error({ 
                jobId: job.id, 
                txid,
                error: error.message,
                stack: error.stack 
            }, "❌ [WebhookWorker] Falha no processamento do webhook");
            throw error; // Retry
        }
    },
    {
        connection: redisConfig,
        concurrency: 5, // Webhooks são rápidos (só DB update), pode ter mais concurrency
        limiter: {
             max: 100, 
             duration: 1000 // 100 por segundo (alta vazão)
        }
    }
);
