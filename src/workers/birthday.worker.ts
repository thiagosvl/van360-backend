import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { BirthdayJobData, QUEUE_NAME_BIRTHDAY } from '../queues/birthday.queue.js';
import { passageiroService } from '../services/passageiro.service.js';
import { notificationService } from '../services/notifications/notification.service.js';
import { EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA } from '../config/constants.js';
import { formatarPlacaExibicao } from '../utils/placa.utils.js';
import { NotificationChannelEnum } from '../types/enums.js';

export const birthdayWorker = new Worker<BirthdayJobData>(
    QUEUE_NAME_BIRTHDAY,
    async (job: Job<BirthdayJobData>) => {
        const { motoristaId } = job.data;
        logger.info({ jobId: job.id, motoristaId }, "[Worker] Verificando aniversários da semana...");

        try {
            const result = await passageiroService.processarLembreteAniversarioMotorista(job.data);
            if (result.sent) {
                logger.info({ motoristaId }, "[Worker] Lembrete enviado com sucesso.");
            } else {
                logger.info({ motoristaId, reason: result.reason }, "[Worker] Lembrete de aniversário não enviado.");
            }
            return result;
        } catch (error: any) {
            logger.error({ jobId: job.id, motoristaId, error: error.message }, "[Worker] Falha ao processar aniversário no worker");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 5,
        limiter: {
            max: 20,
            duration: 10000
        }
    }
);
