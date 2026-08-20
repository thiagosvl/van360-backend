import { logger } from "../config/logger.js";
import { contractWorker } from "../workers/contract.worker.js";
import { generationWorker } from "../workers/generation.worker.js";
import { telegramWorker } from "../workers/telegram.worker.js";
import { cronWorker } from "../workers/cron.worker.js";
import { birthdayWorker } from "../workers/birthday.worker.js";
import { evolutionTransactionalWorker, evolutionBulkWorker } from "../workers/evolution.worker.js";
import { setupCronJobs } from "../queues/cron.queue.js";

export const queueService = {
    async initialize() {
        logger.info("[QueueService] Inicializando workers...");

        await setupCronJobs();

        if (generationWorker) logger.info(`[QueueService] Worker iniciado: ${generationWorker.name}`);
        if (contractWorker) logger.info(`[QueueService] Worker iniciado: ${contractWorker.name}`);
        if (telegramWorker) logger.info(`[QueueService] Worker iniciado: ${telegramWorker.name}`);
        if (cronWorker) logger.info(`[QueueService] Worker iniciado: ${cronWorker.name}`);
        if (birthdayWorker) logger.info(`[QueueService] Worker iniciado: ${birthdayWorker.name}`);
        if (evolutionTransactionalWorker) logger.info(`[QueueService] Worker iniciado: ${evolutionTransactionalWorker.name}`);
        if (evolutionBulkWorker) logger.info(`[QueueService] Worker iniciado: ${evolutionBulkWorker.name}`);
        logger.info("[QueueService] Todos os workers ativos e processando filas.");
    },

    async shutdown() {
        logger.info("[QueueService] Desligando workers...");
        await Promise.all([
            generationWorker.close(),
            contractWorker.close(),
            telegramWorker.close(),
            cronWorker.close(),
            birthdayWorker.close(),
            evolutionTransactionalWorker.close(),
            evolutionBulkWorker.close(),
        ]);
        logger.info("[QueueService] Workers encerrados.");
    }
};
