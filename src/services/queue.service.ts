import { logger } from "../config/logger.js";
import { redisClient } from "../config/redis.js";
import { contractWorker } from "../workers/contract.worker.js";
import { generationWorker } from "../workers/generation.worker.js";
import { telegramWorker } from "../workers/telegram.worker.js";
import { cronWorker } from "../workers/cron.worker.js";
import { birthdayWorker } from "../workers/birthday.worker.js";
import { evolutionTransactionalWorker, evolutionBulkWorker } from "../workers/evolution.worker.js";
import { repasseWorker } from "../workers/repasse.worker.js";
import { setupCronJobs } from "../queues/cron.queue.js";
import { cobrancaService } from "./cobranca.service.js";
import { historicoRepository } from "../repositories/historico.repository.js";

const REMEDIATION_LOCK_KEY = "daily-charge-monitor:remediation:2026-11-07";

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
        if (repasseWorker) logger.info(`[QueueService] Worker iniciado: ${repasseWorker.name}`);
        logger.info("[QueueService] Todos os workers ativos e processando filas.");

        try {
            const acquired = await redisClient.set(REMEDIATION_LOCK_KEY, "1", "EX", 86400 * 7, "NX");
            if (acquired === "OK") {
                logger.info("[QueueService] Disparando repescagem automática única do monitor diário de cobranças...");
                void historicoRepository.deleteFalhaIntegracaoByEntidadeId("372c2318-2e34-4edc-ab66-a4300ef92645");
                void cobrancaService.enviarNotificacoesDiarias();
            }
        } catch (err: unknown) {
            logger.warn({ err: err instanceof Error ? err.message : String(err) }, "[QueueService] Não foi possível verificar lock de repescagem no Redis");
        }
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
            repasseWorker.close(),
        ]);
        logger.info("[QueueService] Workers encerrados.");
    }
};
