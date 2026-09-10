import "dotenv/config";

process.env.TZ = "America/Sao_Paulo";

import { initSentry } from "./config/sentry.js";
initSentry();

import { createApp } from "./app.js";
import { errorAlertService } from "./services/error-alert.service.js";

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
  void errorAlertService.notifyFatalError({
    error: reason,
    origin: "unhandledRejection"
  });
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  void errorAlertService.notifyFatalError({
    error,
    origin: "uncaughtException"
  });
});

const start = async () => {
  try {
    const app = await createApp();
    const port = Number(process.env.PORT) || 3000;

    await app.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
    console.log(`📊 Bull Board: http://localhost:${port}/admin/queues`);
  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
};

start();
