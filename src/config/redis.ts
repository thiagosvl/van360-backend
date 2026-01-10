import { ConnectionOptions } from 'bullmq';
import { env } from 'process';

/**
 * Configuração centralizada do Redis para as Filas (BullMQ)
 * Reutiliza as variáveis de ambiente já existentes se possível.
 */
export const redisConfig: ConnectionOptions = {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
    // Configurações recomendadas para produção
    maxRetriesPerRequest: null, 
    enableReadyCheck: false,
};
