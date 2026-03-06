import { createQueue } from "./index.js";

export const QUEUE_NAME_CRON = 'cron-queue';

export const cronQueue = createQueue(QUEUE_NAME_CRON);

/**
 * Configura os agendamentos repetitivos (Cron) nativos do BullMQ na VPS.
 * Isso garante alta frequência e baixa latência sem depender de Webhooks externos.
 */
export const setupCronJobs = async () => {
    // 1. Limpar agendamentos antigos para evitar duplicidade ao reiniciar
    const repeatableJobs = await cronQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
        await cronQueue.removeRepeatableByKey(job.key);
    }

    // 2. Monitor de Repasses (C6/Inter) - A cada 2 minutos
    // Verifica status de transferências submetidas
    await cronQueue.add('repasse-monitor', {}, {
        repeat: { pattern: '*/2 * * * *' } // Cron: a cada 2 minutos
    });

    // 3. Monitor de Validação PIX - A cada 5 minutos
    // Verifica mini-transferências de 0,01 centavo
    await cronQueue.add('pix-validation-monitor', {}, {
        repeat: { pattern: '*/5 * * * *' } 
    });

    // 4. Retentativa de Repasses - A cada 15 minutos
    await cronQueue.add('repasse-retry', {}, {
        repeat: { pattern: '*/15 * * * *' }
    });

    // --- JOBS DIÁRIOS (Executados em horários específicos) ---

    // 5. Reconciliação Geral - 06:10 AM
    await cronQueue.add('reconciliacao-entrada', {}, {
        repeat: { pattern: '10 6 * * *' }
    });

    // 6. Monitor de Assinaturas (Motoristas) - 09:10 AM
    await cronQueue.add('daily-subscription-monitor', {}, {
        repeat: { pattern: '10 9 * * *' }
    });

    // 7. Geração de Cobranças Mensais/Renovações - 11:10 AM
    await cronQueue.add('charge-generator', {}, {
        repeat: { pattern: '10 11 * * *' }
    });
    await cronQueue.add('subscription-generator', {}, {
        repeat: { pattern: '15 11 * * *' }
    });

    // 8. Monitor de Cobranças (Passageiros) - 12:10 PM
    await cronQueue.add('daily-charge-monitor', {}, {
        repeat: { pattern: '10 12 * * *' }
    });
};
