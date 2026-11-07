import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_GENERATION = 'generation-queue';

export const generationQueue = createQueue(QUEUE_NAME_GENERATION);

export interface GenerationJobData {
    motoristaId?: string;
    mes?: number;
    ano?: number;
    cobrancaId?: string;
}

export const addToGenerationQueue = async (data: { motoristaId: string; mes: number; ano: number }) => {
    const jobId = `gen-${data.motoristaId}-${data.mes}-${data.ano}`;
    
    try {
        await generationQueue.add('generate-monthly', data, {
            jobId, 
            removeOnComplete: true
        });
        logger.debug({ jobId }, "[Queue] Job added to generation-queue");
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg }, "[Queue] Failed to add job to generation-queue");
        throw error;
    }
};

export const addPixWarmupToGenerationQueue = async (cobrancaId: string) => {
    const jobId = `pix-warmup-${cobrancaId}`;

    try {
        await generationQueue.add(
            'warmup-pix',
            { cobrancaId },
            {
                jobId,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000
                },
                removeOnComplete: true
            }
        );
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn({ error: msg, cobrancaId }, "[Queue] Falha ao enfileirar pré-geração de Pix");
    }
};
