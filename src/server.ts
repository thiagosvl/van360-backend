// Servidor local para desenvolvimento
// Para produção na Vercel, use api/index.ts
import "dotenv/config";

// Garantir que o Node.js rode no fuso horário de Brasília
process.env.TZ = "America/Sao_Paulo";

// IMPORTANTE: Sentry deve ser inicializado ANTES de qualquer outro import

import { initSentry } from "./config/sentry.js";
initSentry();

import { createApp } from "./app.js";
import { queueService } from "./services/queue.service.js";

const start = async () => {
  try {
    const app = await createApp();
    const port = Number(process.env.PORT) || 3000;

    // Inicializa filas e serviços
    await Promise.all([
      queueService.initialize(),
      // paymentService.initialize()
    ]);

    await app.listen({ port, host: "0.0.0.0" });
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
    console.log(`📊 Bull Board: http://localhost:${port}/admin/queues`);
  } catch (err) {
    console.error("❌ Erro ao iniciar servidor:", err);
    process.exit(1);
  }
};

start();
