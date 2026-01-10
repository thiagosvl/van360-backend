import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_PIX = 'pix-queue';

export const pixQueue = createQueue(QUEUE_NAME_PIX);

export interface PixJobData {
    cobrancaId: string;
    valor: number;
    cpf: string;
    nome: string;
    dataVencimento: string;
}

/**
 * Adiciona um job de registro de PIX na fila (para geração em lote).
 * IDEMPOTÊNCIA: Job ID = `pix-{cobrancaId}` para evitar registros duplicados.
 */
export const addToPixQueue = async (data: PixJobData) => {
    const jobId = `pix-${data.cobrancaId}`;
    
    try {
        await pixQueue.add('register-pix', data, {
            jobId, 
            removeOnComplete: true,
            attempts: 5, // Tenta várias vezes se a API do Inter falhar
            backoff: {
                type: 'exponential',
                delay: 2000 // 2s, 4s, 8s, 16s...
            }
        });
        logger.debug({ jobId }, "[Queue] Job added to pix-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to pix-queue");
        throw error;
    }
};
