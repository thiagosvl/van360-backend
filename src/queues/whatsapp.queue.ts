import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";
import { WhatsappPurpose } from "../types/enums.js";

export const QUEUE_NAME_WHATSAPP_TRANSACTIONAL = 'whatsapp-transactional-queue';
export const QUEUE_NAME_WHATSAPP_BULK = 'whatsapp-bulk-queue';

export const whatsappTransactionalQueue = createQueue(QUEUE_NAME_WHATSAPP_TRANSACTIONAL);
export const whatsappBulkQueue = createQueue(QUEUE_NAME_WHATSAPP_BULK);

export interface WhatsappJobData {
    phone: string;
    message?: string;
    compositeMessage?: any[]; // Suporte para novo formato
    options?: any;
    // Metadata para log
    context?: string; 
    userId?: string;
    purpose?: WhatsappPurpose;
}

/**
 * Adiciona um job de envio de WhatsApp na fila correspondente.
 * @param jobId Opcional. ID único para idempotência (evita duplicidade).
 */
export const addToWhatsappQueue = async (data: WhatsappJobData, jobId?: string) => {
    try {
        const queue = data.purpose === WhatsappPurpose.BULK ? whatsappBulkQueue : whatsappTransactionalQueue;
        const queueName = data.purpose === WhatsappPurpose.BULK ? QUEUE_NAME_WHATSAPP_BULK : QUEUE_NAME_WHATSAPP_TRANSACTIONAL;

        await queue.add('send-message', data, {
            jobId: jobId, 
            removeOnComplete: true,
            attempts: 10, // Tenta até 10 vezes em caso de falha (ex: offline)
            backoff: {
                type: 'exponential',
                delay: 60000 // Começa com 1 minuto de intervalo e aumenta
            }
        });
        logger.debug({ phone: data.phone, context: data.context, queue: queueName, jobId }, "[Queue] Job added to whatsapp queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to whatsapp queue");
        throw error;
    }
};
