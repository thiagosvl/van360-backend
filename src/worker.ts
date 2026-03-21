import "dotenv/config";
import { initSentry } from "./config/sentry.js";
initSentry();

import { logger } from "./config/logger.js";

import { queueService } from "./services/queue.service.js";

// Entry Point para os Workers (VPS)
// Este arquivo é responsável por iniciar o processamento das filas e nada mais.
// Não sobe servidor HTTP (Fastify), economizando memória.

const startWorker = async () => {
  logger.info("🚀 Iniciando Workers Van360...");

  try {
    // 1. Inicializar serviços externos e provedores vitais para o Worker


    // 2. Inicializar Filas e Workers
    // A queueService já cuida de conectar no Redis e instanciar os Workers do BullMQ
    await queueService.initialize();

    logger.info("✅ Workers iniciados e aguardando jobs...");
    
    // Manter processo vivo
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM recebido. Encerrando graciosamente...');
      await queueService.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('SIGINT recebido. Encerrando graciosamente...');
      await queueService.shutdown();
      process.exit(0);
    });

  } catch (err) {
    logger.error({ err }, "❌ Erro fatal ao iniciar workers");
    process.exit(1);
  }
};

startWorker();
