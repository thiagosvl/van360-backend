import "dotenv/config";

process.env.TZ = "America/Sao_Paulo";

import { initSentry } from "./config/sentry.js";
initSentry();

import { logger } from "./config/logger.js";

import { queueService } from "./services/queue.service.js";

const startWorker = async () => {
  logger.info("🚀 Iniciando Workers Van360...");

  try {
    await queueService.initialize();

    logger.info("✅ Workers iniciados e aguardando jobs...");
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
