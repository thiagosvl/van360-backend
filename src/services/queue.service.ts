import { logger } from "../config/logger.js";
import { contractWorker } from "../workers/contract.worker.js";
import { generationWorker } from "../workers/generation.worker.js";
import { whatsappWorker } from "../workers/whatsapp.worker.js";

/**
 * Serviço responsável por inicializar e gerenciar os Workers das filas.
 * Deve ser chamado no startup da aplicação.
 */
export const queueService = {
    async initialize() {
        logger.info("[QueueService] Initializing workers...");

        if (whatsappWorker) logger.info(`[QueueService] Worker started: ${whatsappWorker.name}`);
        if (generationWorker) logger.info(`[QueueService] Worker started: ${generationWorker.name}`);
        if (contractWorker) logger.info(`[QueueService] Worker started: ${contractWorker.name}`);
        // if (cronWorker) logger.info(`[QueueService] Worker started: ${cronWorker.name}`);

        // Configura agendamentos repetitivos (Cron) na VPS - DESATIVADOS NO PLANO BASE
        // await setupCronJobs();

        logger.info("[QueueService] All workers initialized and Cron Jobs scheduled.");
    },

    async shutdown() {
        logger.info("[QueueService] Shutting down workers...");
        await Promise.all([
            whatsappWorker.close(),
            generationWorker.close(),
            contractWorker.close(),
            // cronWorker.close()
        ]);
        logger.info("[QueueService] Workers stopped.");
    }
};
