import { createQueue } from "./index.js";
import { CronJob } from "../types/enums.js";

export const QUEUE_NAME_CRON = 'cron-queue';

export const cronQueue = createQueue(QUEUE_NAME_CRON);

export const setupCronJobs = async () => {
    const repeatableJobs = await cronQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await cronQueue.removeRepeatableByKey(job.key);
    }

    // Geração de Cobranças Mensais de Passageiros - 06:10 AM
    await cronQueue.add(CronJob.CHARGE_GENERATOR, {}, {
        repeat: { pattern: '10 6 * * *' }
    });

    // Geração de Faturas de Renovação SaaS - 06:20 AM (idempotente)
    await cronQueue.add(CronJob.SUBSCRIPTION_GENERATOR, {}, {
        repeat: { pattern: '20 6 * * *' }
    });

    // Monitor de Assinaturas SaaS - 13:10 PM (inclui notificações WhatsApp)
    await cronQueue.add(CronJob.DAILY_SUBSCRIPTION_MONITOR, {}, {
        repeat: { pattern: '10 13 * * *' }
    });

    // Monitor de Cobranças (Passageiros) - 13:30 PM (notificações de vencimento)
    await cronQueue.add(CronJob.DAILY_CHARGE_MONITOR, {}, {
        repeat: { pattern: '30 13 * * *' }
    });
};
