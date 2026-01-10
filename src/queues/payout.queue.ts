import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_PAYOUT = 'payout-queue';

export const payoutQueue = createQueue(QUEUE_NAME_PAYOUT);

export interface PayoutJobData {
    cobrancaId: string;
    transacaoId?: string; // Se já existir registro de transação
    valorRepasse: number;
    motoristaId: string;
}

/**
 * Adiciona um job de repasse (Payout) na fila.
 * IDEMPOTÊNCIA: Job ID = `payout-{cobrancaId}`.
 */
export const addToPayoutQueue = async (data: PayoutJobData) => {
    const jobId = `payout-${data.cobrancaId}`;
    
    try {
        await payoutQueue.add('process-payout', data, {
            jobId, 
            removeOnComplete: true,
            attempts: 10, // Tentar muitas vezes, o dinheiro tem que chegar
            backoff: {
                type: 'exponential',
                delay: 60 * 1000 // 1 min, 2 min, 4 min...
            }
        });
        logger.debug({ jobId }, "[Queue] Job added to payout-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to payout-queue");
        throw error;
    }
};
