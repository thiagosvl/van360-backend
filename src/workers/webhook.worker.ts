import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_WEBHOOK, WebhookJobData } from '../queues/webhook.queue.js';
import { webhookAssinaturaHandler } from '../services/handlers/webhook-assinatura.handler.js';
import { webhookCobrancaHandler } from '../services/handlers/webhook-cobranca.handler.js';

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
            // 1. Tentar Handler de Assinaturas (SaaS)
            logger.debug({ txid, jobId: job.id }, "[WebhookWorker] Tentando handler de Assinatura");
            const handledAssinatura = await webhookAssinaturaHandler.handle(pagamento);
            if (handledAssinatura) {
                logger.info({ jobId: job.id, txid, type: 'ASSINATURA' }, "✅ [WebhookWorker] Processado via AssinaturaHandler");
                return;
            }

            // 2. Tentar Handler de Mensalidades/Pais (Repasse)
            logger.debug({ txid, jobId: job.id }, "[WebhookWorker] Tentando handler de Cobrança (Repasse)");
            const handledCobranca = await webhookCobrancaHandler.handle(pagamento);
            if (handledCobranca) {
                logger.info({ jobId: job.id, txid, type: 'COBRANCA_PAI' }, "✅ [WebhookWorker] Processado via CobrancaHandler");
                return;
            }

            // 3. Fallback: Desconhecido
            logger.warn({ txid, endToEndId, valor, jobId: job.id }, "⚠️ [WebhookWorker] Webhook ignorado: Nenhuma cobrança correspondente encontrada no sistema");

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
