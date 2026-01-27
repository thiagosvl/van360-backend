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
    // PRODUÇÃO: Dual output (PM2 + Better Stack)
    return {
      ...baseConfig,
      transport: {
        targets: [
          // Console (para PM2 logs)
          {
            target: 'pino-pretty',
            level: env.LOG_LEVEL || 'info',
            options: {
              colorize: false,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
            },
          },
          // Better Stack/Logtail
          {
            target: '@logtail/pino',
            level: env.LOG_LEVEL || 'info',
            options: {
              sourceToken: env.LOGTAIL_TOKEN, // ✅ CORRETO: sourceToken, não token
            },
          },
        ],
      },
    };
  } 
  
  if (isDevelopment) {
    // DESENVOLVIMENTO: Pretty print
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

  // FALLBACK: JSON puro
  return baseConfig;
}

const loggerConfig = getLoggerConfig();
const logger = pino(loggerConfig);

// Log de confirmação
if (isProduction && env.LOGTAIL_TOKEN) {
  console.log("✅ Logger configurado com Better Stack (Logtail)");
} else if (isDevelopment) {
  console.log("✅ Logger configurado com pino-pretty (desenvolvimento)");
} else {
  console.log("⚠️  Logger configurado sem transporte (JSON puro)");
}

export { logger };
