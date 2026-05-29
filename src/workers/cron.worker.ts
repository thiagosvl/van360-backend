import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_CRON } from '../queues/cron.queue.js';

import { subscriptionMonitorService } from '../services/subscriptions/subscription-monitor.service.js';
import { cobrancaService } from '../services/cobranca.service.js';
import { getConfigNumber } from '../services/configuracao.service.js';
import { ConfigKey, CronJob } from '../types/enums.js';

/**
 * Worker responsável por executar os Jobs agendados (Cron) na VPS.
 */
export const cronWorker = new Worker(
    QUEUE_NAME_CRON,
    async (job: Job) => {
        logger.info({ jobName: job.name }, "[CronWorker] ⏰ Executando job agendado");

        try {
            switch (job.name) {
                case CronJob.DAILY_SUBSCRIPTION_MONITOR:
                case CronJob.SUBSCRIPTION_CHECK:
                    await subscriptionMonitorService.runDailyCheck();
                    break;

                case CronJob.SUBSCRIPTION_GENERATOR: {
                    const daysBefore = await getConfigNumber(ConfigKey.SAAS_DIAS_VENCIMENTO, 5);
                    await subscriptionMonitorService.generateRenewalInvoices(daysBefore);
                    break;
                }

                case CronJob.CHARGE_GENERATOR:
                    await cobrancaService.gerarCobrancasMensaisParaTodos();
                    break;

                case CronJob.DAILY_CHARGE_MONITOR:
                    await cobrancaService.enviarNotificacoesDiarias();
                    break;

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
        concurrency: 1
    }
);
