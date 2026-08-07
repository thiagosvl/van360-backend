import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";
import { EvolutionPurpose } from "../types/enums.js";

export const QUEUE_NAME_EVOLUTION_TRANSACTIONAL = 'evolution-transactional-queue';
export const QUEUE_NAME_EVOLUTION_BULK = 'evolution-bulk-queue';

export const evolutionTransactionalQueue = createQueue(QUEUE_NAME_EVOLUTION_TRANSACTIONAL);
export const evolutionBulkQueue = createQueue(QUEUE_NAME_EVOLUTION_BULK);

export interface EvolutionJobData {
    phone: string;
    message?: string;
    compositeMessage?: any[]; // Suporte para novo formato
    options?: any;
    // Metadata para log
    context?: string;
    userId?: string;
    purpose?: EvolutionPurpose;
}

/**
 * Adiciona um job de envio na fila correspondente.
 * @param jobId Opcional. ID único para idempotência (evita duplicidade).
 */
export const addToQueue = async (data: EvolutionJobData, jobId?: string) => {
    try {
        const queue = data.purpose === EvolutionPurpose.BULK ? evolutionBulkQueue : evolutionTransactionalQueue;
        const queueName = data.purpose === EvolutionPurpose.BULK ? QUEUE_NAME_EVOLUTION_BULK : QUEUE_NAME_EVOLUTION_TRANSACTIONAL;

        await queue.add('send-message', data, {
            jobId: jobId,
            removeOnComplete: true,
            attempts: 10, // Tenta até 10 vezes em caso de falha (ex: offline)
            backoff: {
                type: 'exponential',
                delay: 60000 // Começa com 1 minuto de intervalo e aumenta
            }
        });
        logger.debug({ phone: data.phone, context: data.context, queue: queueName, jobId }, "[Queue] Job added to queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to queue");
        throw error;
    }
};
