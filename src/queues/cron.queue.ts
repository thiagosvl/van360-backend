import { createQueue } from "./index.js";
import { CronJob } from "../types/enums.js";
import { logger } from "../config/logger.js";

export const QUEUE_NAME_CRON = 'cron-queue';

export const cronQueue = createQueue(QUEUE_NAME_CRON);

interface CronDefinition {
    name: CronJob;
    pattern?: string;
    every?: number;
}

const TIMEZONE_BR = 'America/Sao_Paulo';

const CRON_DEFINITIONS: CronDefinition[] = [
    { name: CronJob.CHARGE_GENERATOR, pattern: '10 6 * * *' },
    { name: CronJob.SUBSCRIPTION_GENERATOR, pattern: '20 6 * * *' },
    { name: CronJob.DAILY_SUBSCRIPTION_MONITOR, pattern: '10 13 * * *' },
    { name: CronJob.DAILY_CHARGE_MONITOR, pattern: '30 13 * * *' },
    { name: CronJob.BIRTHDAY_REMINDER, pattern: '0 14 * * 0' },
    { name: CronJob.WEEKLY_DRIVER_CHARGE_SUMMARY, pattern: '30 14 * * 1' },
    { name: CronJob.NOTIFICATION_RETRY, every: 2 * 60 * 1000 }
];

export const setupCronJobs = async (maxAttempts = 3, delayMs = 3000): Promise<void> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const existingJobs = await cronQueue.getRepeatableJobs();

            for (const job of existingJobs) {
                await cronQueue.removeRepeatableByKey(job.key);
            }

            for (const def of CRON_DEFINITIONS) {
                if (def.pattern) {
                    await cronQueue.add(def.name, {}, {
                        jobId: `cron-${def.name}`,
                        repeat: {
                            pattern: def.pattern,
                            tz: TIMEZONE_BR
                        }
                    });
                } else if (def.every) {
                    await cronQueue.add(def.name, {}, {
                        jobId: `cron-${def.name}`,
                        repeat: {
                            every: def.every
                        }
                    });
                }
            }

            const verifiedJobs = await cronQueue.getRepeatableJobs();
            logger.info({ count: verifiedJobs.length }, "[CronQueue] Agendamentos recorrentes verificados e ativos no Redis.");
            return;
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn({ attempt, maxAttempts, error: msg }, "[CronQueue] Falha transitória ao registrar crons no Redis. Tentando novamente...");

            if (attempt === maxAttempts) {
                logger.error({ error: msg }, "[CronQueue] Erro crítico: Não foi possível registrar crons recorrentes após múltiplas tentativas.");
                throw error;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
};

