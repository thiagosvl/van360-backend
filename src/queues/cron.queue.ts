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

    // 5. Reconciliação Geral - 06:00 AM (processamento puro, sem notificação)
    await cronQueue.add('reconciliacao-entrada', {}, {
        repeat: { pattern: '0 6 * * *' }
    });

    // 6. Geração de Cobranças Mensais de Passageiros + PIX - 06:10 AM (processamento puro)
    await cronQueue.add('charge-generator', {}, {
        repeat: { pattern: '10 6 * * *' }
    });

    // 7. Geração de Faturas de Renovação SaaS - 06:20 AM (processamento puro, idempotente)
    await cronQueue.add('subscription-generator', {}, {
        repeat: { pattern: '20 6 * * *' }
    });

    // 8. Monitor de Assinaturas SaaS - 13:10 PM (inclui notificações WhatsApp)
    // Horário ocioso do motorista: entre rotas do meio-dia e da tarde
    await cronQueue.add('daily-subscription-monitor', {}, {
        repeat: { pattern: '10 13 * * *' }
    });

    // 9. Monitor de Cobranças (Passageiros) - 13:30 PM (stub — horário reservado para quando implementado)
    await cronQueue.add('daily-charge-monitor', {}, {
        repeat: { pattern: '30 13 * * *' }
    });
};
