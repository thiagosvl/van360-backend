import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_CRON } from '../queues/cron.queue.js';
import { chargeGeneratorJob } from '../services/jobs/charge-generator.job.js';
import { dailyChargeMonitorJob } from '../services/jobs/daily-charge-monitor.job.js';
import { dailySubscriptionMonitorJob } from '../services/jobs/daily-subscription-monitor.job.js';
import { pixValidationMonitorJob } from '../services/jobs/pix-validation-monitor.job.js';
import { reconciliacaoEntradaJob } from '../services/jobs/reconciliacao-entrada.job.js';
import { repasseMonitorJob } from '../services/jobs/repasse-monitor.job.js';
import { repasseRetryJob } from '../services/jobs/repasse-retry.job.js';
import { subscriptionGeneratorJob } from '../services/jobs/subscription-generator.job.js';

/**
 * Worker responsável por executar os Jobs agendados (Cron) na VPS.
 */
export const cronWorker = new Worker(
    QUEUE_NAME_CRON,
    async (job: Job) => {
        logger.info({ jobName: job.name }, "[CronWorker] ⏰ Executando job agendado");

        try {
            switch (job.name) {
                case 'repasse-monitor':
                    await repasseMonitorJob.run();
                    break;
                
                case 'pix-validation-monitor':
                    await pixValidationMonitorJob.run();
                    break;

                case 'repasse-retry':
                    await repasseRetryJob.run();
                    break;
                
                case 'reconciliacao-entrada':
                    await reconciliacaoEntradaJob.run();
                    break;

                case 'daily-subscription-monitor':
                    await dailySubscriptionMonitorJob.run();
                    break;

                case 'charge-generator':
                    await chargeGeneratorJob.run();
                    break;

                case 'subscription-generator':
                    await subscriptionGeneratorJob.run();
                    break;

                case 'daily-charge-monitor':
                    await dailyChargeMonitorJob.run();
                    break;

                default:
                    logger.warn({ jobName: job.name }, "[CronWorker] Job desconhecido recebido.");
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
