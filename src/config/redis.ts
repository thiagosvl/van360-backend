import { ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from 'process';

export const redisConfig: ConnectionOptions = {
    host: env.REDIS_HOST || 'localhost',
    port: Number(env.REDIS_PORT) || 6379,
    password: env.REDIS_PASSWORD || undefined,
    username: env.REDIS_USERNAME || undefined,
    tls: (env.REDIS_TLS === 'true' || env.REDIS_PORT === '25061' || (env.REDIS_HOST && env.REDIS_HOST.includes('ondigitalocean'))) 
        ? { rejectUnauthorized: false } 
        : undefined,
    maxRetriesPerRequest: null, 
    enableReadyCheck: false,
    family: 4, 
};

export const redisClient = new Redis({
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    username: redisConfig.username,
    tls: redisConfig.tls,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    family: redisConfig.family,
});
