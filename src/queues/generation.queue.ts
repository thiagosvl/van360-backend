import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_GENERATION = 'generation-queue';

export const generationQueue = createQueue(QUEUE_NAME_GENERATION);

export interface GenerationJobData {
    motoristaId: string;
    mes: number;
    ano: number;
}

/**
 * Adiciona um job de geração de cobranças mensais.
 * 
 * IDEMPOTÊNCIA:
 * O Job ID é composto por "gen-{motoristaId}-{mes}-{ano}".
 * Isso garante que, se o processo rodar 2x, não duplicamos a geração para o mesmo motorista no mesmo mês.
 */
export const addToGenerationQueue = async (data: GenerationJobData) => {
    const jobId = `gen-${data.motoristaId}-${data.mes}-${data.ano}`;
    
    try {
        await generationQueue.add('generate-monthly', data, {
            jobId, 
            removeOnComplete: true
        });
        logger.debug({ jobId }, "[Queue] Job added to generation-queue");
    } catch (error: any) {
        logger.error({ error: error.message }, "[Queue] Failed to add job to generation-queue");
        throw error;
    }
};
