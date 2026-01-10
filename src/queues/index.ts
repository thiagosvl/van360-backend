import { Queue } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';

/**
 * Factory para criar e gerenciar filas de forma centralizada.
 * @param queueName Nome da fila
 */
export const createQueue = (queueName: string) => {
    logger.info(`[Queue] Initializing queue: ${queueName}`);
    
    const queue = new Queue(queueName, {
        connection: redisConfig,
        defaultJobOptions: {
            attempts: 3, // Tenta 3 vezes se falhar
            backoff: {
                type: 'exponential',
                delay: 1000,
            },
            removeOnComplete: true, // Remove job se sucesso (economiza RAM)
            removeOnFail: false // Mantém job se erro (para debug)
        }
    });

    return queue;
};
