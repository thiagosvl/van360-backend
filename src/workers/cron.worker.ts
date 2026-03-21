import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_CRON } from '../queues/cron.queue.js';


/**
 * Worker responsável por executar os Jobs agendados (Cron) na VPS.
 */
export const cronWorker = new Worker(
    QUEUE_NAME_CRON,
    async (job: Job) => {
        logger.info({ jobName: job.name }, "[CronWorker] ⏰ Executando job agendado");

        try {
            switch (job.name) {
                /* 
                case 'repasse-monitor':
                    await repasseMonitorJob.run();
                    break;
                
                case 'pix-validation-monitor':
                    await pixValidationMonitorJob.run();
                    break;

                case 'repasse-retry':
                    await repasseRetryJob.run();
                    break;
                
                case 'repasse-reconciliator':
                    await repasseReconciliatorJob.run();
                    break;
                
                case 'reconciliacao-entrada':
                    await reconciliacaoEntradaJob.run();
                    break;
                */

                default:
                    logger.warn({ jobName: job.name }, "[CronWorker] Job DESATIVADO ou desconhecido recebido.");
            }
        } catch (error: any) {
            logger.error({ 
                jobName: job.name, 
                error: error.message 
            }, "❌ [CronWorker] Falha ao executar job agendado");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 1 // Cron jobs rodam um por vez para evitar sobrecarga
    }
);
