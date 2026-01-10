import pino from "pino";

// Usar pino-pretty em desenvolvimento para logs formatados
const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({ 
  level: process.env.LOG_LEVEL || "info",
  // Redação de dados sensíveis para logs de produção (e dev)
  redact: {
      paths: [
          "email", 
          "password", 
          "senha", 
          "cpf", 
          "cpfcnpj", 
          "authorization", 
          "Authorization", 
          "headers.authorization",
          "access_token",
          "refresh_token"
      ],
      remove: true
  },
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
