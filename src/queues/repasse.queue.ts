import { logger } from "../config/logger.js";
import { createQueue } from "./index.js";

export const QUEUE_NAME_REPASSE = "repasse-queue";

export const repasseQueue = createQueue(QUEUE_NAME_REPASSE);

export interface RepasseJobData {
    repasseId: string;
    cobrancaId: string;
    motoristaId: string;
    chavePix: string;
    valorLiquido: number;
    transacaoProvedorId: string;
}

export const addToRepasseQueue = async (data: RepasseJobData) => {
    const jobId = `repasse-${data.cobrancaId}`;

    try {
        const existingJob = await repasseQueue.getJob(jobId);
        if (existingJob) {
            await existingJob.remove().catch(() => {});
        }

        await repasseQueue.add("processar-repasse", data, {
            jobId,
            removeOnComplete: true,
            removeOnFail: false,
            delay: 3000,
            attempts: 5,
            backoff: {
                type: "exponential",
                delay: 3000
            }
        });
        logger.info({ jobId, repasseId: data.repasseId }, "[Queue] Job adicionado à repasse-queue");
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error({ error: msg, jobId }, "[Queue] Falha ao adicionar job à repasse-queue");
        throw error;
    }
};
