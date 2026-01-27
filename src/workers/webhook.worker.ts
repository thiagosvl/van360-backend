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
        const { pagamento, origin } = job.data;
        const { txid, endToEndId } = pagamento;

        logger.info({ jobId: job.id, txid }, "[Worker] Processing Webhook Job...");

        try {
            // Lógica Dispatcher (movida da rota para o worker)

            // 1. Tentar Handler de Assinaturas (Prioridade: Sistema SaaS)
            const handledAssinatura = await webhookAssinaturaHandler.handle(pagamento);
            if (handledAssinatura) {
                logger.info({ jobId: job.id, type: 'ASSINATURA' }, "[Worker] Webhook processed successfully");
                return;
            }

            // 2. Tentar Handler de Mensalidades/Pais (Repasse)
            const handledCobranca = await webhookCobrancaHandler.handle(pagamento);
            if (handledCobranca) {
                logger.info({ jobId: job.id, type: 'COBRANCA_PAI' }, "[Worker] Webhook processed successfully");
                return;
            }

            // 3. Fallback: Log (Não falha o job, pois foi processado mas não encontrado)
            logger.warn({ txid, endToEndId }, "[Worker] Webhook ignored (Target not found)");

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Webhook Job Failed");
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
