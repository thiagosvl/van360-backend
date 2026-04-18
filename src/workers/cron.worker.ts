import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_CRON } from '../queues/cron.queue.js';


import { subscriptionMonitorService } from '../services/subscriptions/subscription-monitor.service.js';
import { cobrancaService } from '../services/cobranca.service.js';
import { cobrancaPixService } from '../services/payments/cobranca-pix.service.js';
import { getConfigNumber } from '../services/configuracao.service.js';
import { ConfigKey } from '../types/enums.js';

/**
 * Worker responsável por executar os Jobs agendados (Cron) na VPS.
 */
export const cronWorker = new Worker(
    QUEUE_NAME_CRON,
    async (job: Job) => {
        logger.info({ jobName: job.name }, "[CronWorker] ⏰ Executando job agendado");

        try {
            switch (job.name) {
                case 'daily-subscription-monitor':
                case 'subscription-check':
                    await subscriptionMonitorService.runDailyCheck();
                    break;

                case 'subscription-generator': {
                    const daysBefore = await getConfigNumber(ConfigKey.SAAS_DIAS_VENCIMENTO, 5);
                    await subscriptionMonitorService.generateRenewalInvoices(daysBefore);
                    break;
                }

                case 'charge-generator':
                    // 1. Garante que as cobranças do mês (casca) existam no DB
                    await cobrancaService.gerarCobrancasMensaisParaTodos();
                    // 2. Para as cobranças existentes que vencem em breve, gera o Pix com Split
                    await cobrancaPixService.gerarPixParaCobrancasVencendo();
                    break;

                case 'repasse-monitor':
                case 'pix-validation-monitor':
                case 'repasse-retry':
                case 'reconciliacao-entrada':
                    logger.info({ jobName: job.name }, "[CronWorker] Job trigger recebido.");
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
