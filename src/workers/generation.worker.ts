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
        if (job.name === 'warmup-pix' && job.data.cobrancaId) {
            const res = await cobrancaService.obterOuGerarPixCobranca(job.data.cobrancaId);
            return { cobrancaId: job.data.cobrancaId, generated: Boolean(res?.pixCopiaCola || res?.boletoLinhaDigitavel) };
        }

        const { motoristaId, mes, ano } = job.data;
        if (!motoristaId || !mes || !ano) {
            return { skipped: true };
        }

        logger.info({ jobId: job.id, motoristaId, mes, ano }, "[Worker] Iniciando geração mensal...");

        try {
            const stats = await cobrancaService.gerarCobrancasMensaisParaMotorista(motoristaId, mes, ano);

            logger.info({ jobId: job.id, stats }, "[Worker] Geração mensal concluída para motorista");
            return stats;

        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error({ jobId: job.id, error: msg }, "[Worker] Generation Job Failed");
            throw error;
        }
    },
    {
        connection: redisConfig,
        concurrency: 3,
        limiter: {
            max: 3,
            duration: 1000
        }
    }
);
