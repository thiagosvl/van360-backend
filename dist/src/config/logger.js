import pino from "pino";
// Usar pino-pretty em desenvolvimento para logs formatados
const isDevelopment = process.env.NODE_ENV !== 'production';
export const logger = pino({
    level: process.env.LOG_LEVEL || "info",
    ...(isDevelopment && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname'
            }
        }
    })
});
