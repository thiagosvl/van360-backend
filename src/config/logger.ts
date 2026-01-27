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

// Função para obter a configuração correta de transporte
function getLoggerConfig(): pino.LoggerOptions {
  if (isProduction && env.LOGTAIL_TOKEN) {
    return {
      ...baseConfig,
      transport: {
        target: '@logtail/pino',
        options: { token: env.LOGTAIL_TOKEN }
      }
    };
  } 
  
  if (isDevelopment) {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: { 
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname'
        }
      }
    };
  }

  return baseConfig;
}

const loggerConfig = getLoggerConfig();
const logger = pino(loggerConfig);

// Log de confirmação
setImmediate(() => {
    if (isProduction && env.LOGTAIL_TOKEN) {
        logger.info("✅ Logger configurado com Better Stack (Logtail)");
    } else if (isDevelopment) {
        logger.info("✅ Logger configurado com pino-pretty (desenvolvimento)");
    } else {
        logger.info("⚠️  Logger configurado sem transporte (JSON puro)");
    }
});

export { logger, loggerConfig };

