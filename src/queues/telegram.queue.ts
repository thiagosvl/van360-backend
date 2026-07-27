import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_TELEGRAM = 'telegram-queue';

export const telegramQueue = createQueue(QUEUE_NAME_TELEGRAM);

export interface TelegramJobData {
    message: string;
    options?: any;
    context?: string; 
}

/**
 * Adiciona um job de envio de Telegram na fila.
 */
export const addToTelegramQueue = async (data: TelegramJobData, jobId?: string) => {
    try {
        await telegramQueue.add('send-telegram-message', data, {
            jobId: jobId, 
            removeOnComplete: true,
            attempts: 5, // Tenta até 5 vezes
            backoff: {
                type: 'exponential',
                delay: 10000 // Começa com 10 segundos
            }
        });
        logger.debug({ context: data.context, jobId }, "[Queue] Job added to telegram-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to telegram-queue");
        throw error;
    }
};
