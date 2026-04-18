import { logger } from "../config/logger.js";
import { contractWorker } from "../workers/contract.worker.js";
import { generationWorker } from "../workers/generation.worker.js";
import { whatsappWorker } from "../workers/whatsapp.worker.js";
import { cronWorker } from "../workers/cron.worker.js";

/**
 * Serviço responsável por inicializar e gerenciar os Workers das filas.
 * Deve ser chamado no startup da aplicação.
 */
export const queueService = {
    async initialize() {
        logger.info("[QueueService] Inicializando workers...");

        if (whatsappWorker) logger.info(`[QueueService] Worker iniciado: ${whatsappWorker.name}`);
        if (generationWorker) logger.info(`[QueueService] Worker iniciado: ${generationWorker.name}`);
        if (contractWorker) logger.info(`[QueueService] Worker iniciado: ${contractWorker.name}`);
        if (cronWorker) logger.info(`[QueueService] Worker iniciado: ${cronWorker.name}`);

        logger.info("[QueueService] Todos os workers ativos e processando filas.");
    },

    async shutdown() {
        logger.info("[QueueService] Desligando workers...");
        await Promise.all([
            whatsappWorker.close(),
            generationWorker.close(),
            contractWorker.close(),
            cronWorker.close(),
        ]);
        logger.info("[QueueService] Workers encerrados.");
    }
};
