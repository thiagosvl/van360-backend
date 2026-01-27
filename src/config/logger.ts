import pino from "pino";
import { env } from "./env.js";

// Usar pino-pretty em desenvolvimento para logs formatados
const isDevelopment = env.NODE_ENV !== 'production';
const isProduction = env.NODE_ENV === 'production';

// Configuração base do logger (sem formatters personalizados)
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
              token: env.LOGTAIL_TOKEN, // Algumas versões usam 'token'
              sourceToken: env.LOGTAIL_TOKEN, // Outras usam 'sourceToken'
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
  return {
    ...baseConfig,
    formatters: {
      level: (label) => {
        return { level: label.toUpperCase() };
      },
    },
  };
}

const loggerConfig = getLoggerConfig();

// Criar instância estável
const logger = pino(loggerConfig);

// Log de confirmação via console para garantir visibilidade no PM2
if (isProduction && env.LOGTAIL_TOKEN) {
  console.log("✅ Logger configurado para produção com Better Stack (Logtail)");
} else if (isDevelopment) {
  console.log("✅ Logger configurado para desenvolvimento com pino-pretty");
}

// Exportar tanto a instância quanto a configuração
export { logger, loggerConfig };

