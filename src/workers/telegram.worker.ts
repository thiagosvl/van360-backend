import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { QUEUE_NAME_TELEGRAM, TelegramJobData } from '../queues/telegram.queue.js';
import { telegramService } from '../services/telegram.service.js';

export const telegramWorker = new Worker<TelegramJobData>(
    QUEUE_NAME_TELEGRAM,
    async (job: Job<TelegramJobData>) => {
        const { message } = job.data;

        try {
            const success = await telegramService.sendMessage(message);
            if (!success) {
                throw new Error("Falha ao enviar mensagem no Telegram. Verifique as credenciais.");
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Erro interno no Worker";
            logger.error({ jobId: job.id, error: msg }, "[TelegramWorker] Job finalizado com erro");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 1,
        limiter: {
             max: 30, // Telegram API limit is usually 30 msg/sec
             duration: 1000 
        }
    }
);

telegramWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: err.message }, "[TelegramWorker] Job falhou");
});
