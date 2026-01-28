import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_WEBHOOK = 'webhook-queue';

export const webhookQueue = createQueue(QUEUE_NAME_WEBHOOK);

export interface WebhookJobData {
    pagamento: any; // Payload do PIX (txid, valor, etc)
    origin: string; // Origem do webhook
}

/**
 * Adiciona um payload de webhook para processamento seguro.
 */
export const addToWebhookQueue = async (data: WebhookJobData) => {
    try {
        // Job ID único baseado no txid evita processamento duplicado
        // se o banco reenviar o mesmo webhook antes do primeiro processar
        const jobId = data.pagamento.txid || data.pagamento.endToEndId || undefined;
        
        await webhookQueue.add('process-pix', data, {
            jobId: jobId // Deduplicação nativa do BullMQ
        });
        
        logger.debug({ txid: data.pagamento.txid }, "[Queue] Job added to webhook-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to webhook-queue");
        throw error;
    }
};
