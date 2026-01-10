import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_WHATSAPP = 'whatsapp-queue';

export const whatsappQueue = createQueue(QUEUE_NAME_WHATSAPP);

export interface WhatsappJobData {
    phone: string;
    message?: string;
    compositeMessage?: any[]; // Suporte para novo formato
    options?: any;
    // Metadata para log
    context?: string; 
    userId?: string;
}

/**
 * Adiciona um job de envio de WhatsApp na fila.
 * @param jobId Opcional. ID único para idempotência (evita duplicidade).
 */
export const addToWhatsappQueue = async (data: WhatsappJobData, jobId?: string) => {
    try {
        await whatsappQueue.add('send-message', data, {
            jobId: jobId, // Se informado, o Redis ignora se já existir um job com este ID
            removeOnComplete: true
        });
        logger.debug({ phone: data.phone, context: data.context, jobId }, "[Queue] Job added to whatsapp-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to whatsapp-queue");
        throw error;
    }
};
