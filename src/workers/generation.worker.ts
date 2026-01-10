import { Job, Worker } from 'bullmq';
import { logger } from '../config/logger.js';
import { redisConfig } from '../config/redis.js';
import { GenerationJobData, QUEUE_NAME_GENERATION } from '../queues/generation.queue.js';
import { cobrancaService } from '../services/cobranca.service.js';

/**
 * Worker responsável por gerar cobranças em lote (Batch).
 * Executa "gerarCobrancasMensaisParaMotorista" para cada item da fila.
 */
export const generationWorker = new Worker<GenerationJobData>(
    QUEUE_NAME_GENERATION,
    async (job: Job<GenerationJobData>) => {
        const { motoristaId, mes, ano } = job.data;
        logger.info({ jobId: job.id, motoristaId, mes, ano }, "[Worker] Iniciando geração mensal...");

        try {
            const stats = await cobrancaService.gerarCobrancasMensaisParaMotorista(motoristaId, mes, ano);
            
            logger.info({ jobId: job.id, stats }, "[Worker] Geração mensal concluída para motorista");
            return stats;

        } catch (error: any) {
            logger.error({ jobId: job.id, error: error.message }, "[Worker] Generation Job Failed");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 5, // Pode gerar para 5 motoristas simultaneamente (ajustar conforme DB load)
        limiter: {
             max: 20, 
             duration: 10000 
        }
    }
);
