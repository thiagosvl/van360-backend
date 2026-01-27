import { ConnectionOptions } from 'bullmq';
import { env } from 'process';

/**
 * Configuração centralizada do Redis para as Filas (BullMQ)
 * Reutiliza as variáveis de ambiente já existentes se possível.
 */
export const redisConfig: ConnectionOptions = {
    // Se existir REDIS_URL (Padrão DigitalOcean/Render/Heroku), usamos ela.
    // O BullMQ/IORedis faz o parse automático se passar no construtor, 
    // mas aqui estamos exportando options.
    // Então vamos simplificar: se host for URL com rediss, ativamos TLS.
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
    username: env.REDIS_USERNAME || undefined,
    
    // Configurações de TLS (Secure Redis)
    // Se a porta for 25061 (padrão DO) ou o host tiver 'ondigitalocean', forçamos TLS
    tls: (env.REDIS_TLS === 'true' || env.REDIS_PORT === '25061' || (env.REDIS_HOST && env.REDIS_HOST.includes('ondigitalocean'))) 
        ? { rejectUnauthorized: false } 
        : undefined,

    // Configurações recomendadas para produção
    maxRetriesPerRequest: null, 
    enableReadyCheck: false,
    
    // Evita conectar em ReadOnly Replicas se o DNS resolver errado (tenta forçar IPv4 se necessário)
    family: 4, 
};
