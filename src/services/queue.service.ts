import { logger } from "../config/logger.js";
import { contractWorker } from "../workers/contract.worker.js";
import { generationWorker } from "../workers/generation.worker.js";
import { payoutWorker } from "../workers/payout.worker.js";
import { pixWorker } from "../workers/pix.worker.js";
import { receiptWorker } from "../workers/receipt.worker.js";
import { webhookWorker } from "../workers/webhook.worker.js";
import { whatsappWorker } from "../workers/whatsapp.worker.js";

/**
 * Serviço responsável por inicializar e gerenciar os Workers das filas.
 * Deve ser chamado no startup da aplicação.
 */
export const queueService = {
    async initialize() {
        logger.info("[QueueService] Initializing workers...");

        if (whatsappWorker) logger.info(`[QueueService] Worker started: ${whatsappWorker.name}`);
        if (receiptWorker) logger.info(`[QueueService] Worker started: ${receiptWorker.name}`);
        if (webhookWorker) logger.info(`[QueueService] Worker started: ${webhookWorker.name}`);
        if (generationWorker) logger.info(`[QueueService] Worker started: ${generationWorker.name}`);
        if (pixWorker) logger.info(`[QueueService] Worker started: ${pixWorker.name}`);
        if (payoutWorker) logger.info(`[QueueService] Worker started: ${payoutWorker.name}`);
        if (contractWorker) logger.info(`[QueueService] Worker started: ${contractWorker.name}`);

        logger.info("[QueueService] All workers initialized.");
    },

    async shutdown() {
        logger.info("[QueueService] Shutting down workers...");
        await Promise.all([
            whatsappWorker.close(),
            receiptWorker.close(),
            webhookWorker.close(),
            generationWorker.close(),
            pixWorker.close(),
            payoutWorker.close(),
            contractWorker.close()
        ]);
        logger.info("[QueueService] Workers stopped.");
    }
};
