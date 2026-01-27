import pino from "pino";
import { env } from "./env.js";

// Usar pino-pretty em desenvolvimento para logs formatados
const isDevelopment = env.NODE_ENV !== 'production';
const isProduction = env.NODE_ENV === 'production';

// Configuração base do logger
const baseConfig: pino.LoggerOptions = {
  level: env.LOG_LEVEL || "info",
  
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
      "refresh_token",
      "chave_pix",
      "*.password",
      "*.senha",
      "*.cpf",
      "*.token"
    ],
    remove: true
  },
  
  // Adicionar contexto útil em produção
  ...(isProduction && {
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  }),
};

// Configuração de transporte
let logger: pino.Logger;

if (isProduction && env.LOGTAIL_TOKEN) {
  // PRODUÇÃO: Enviar logs para Better Stack (Logtail)
  const { createPinoBetterStackStream } = await import('@logtail/pino');
  
  const stream = createPinoBetterStackStream(env.LOGTAIL_TOKEN);
  
  logger = pino(baseConfig, stream);
  
  console.log("✅ Logger configurado com Better Stack (Logtail)");
} else if (isDevelopment) {
  // DESENVOLVIMENTO: Pretty print no console
  logger = pino({
    ...baseConfig,
    transport: {
      target: 'pino-pretty',
      options: { 
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname'
      }
    }
  });
  
  console.log("✅ Logger configurado com pino-pretty (desenvolvimento)");
} else {
  // FALLBACK: JSON puro
  logger = pino(baseConfig);
  
  console.log("⚠️  Logger configurado sem transporte (JSON puro)");
}

export { logger };
