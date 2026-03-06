import { logger } from "../../config/logger.js";

export const jobOrchestratorService = {
  async runWorker() {
    const now = new Date();
    // Ajuste para Horário de Brasília (Vercel usa UTC)
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = brDate.getHours();
    const minute = brDate.getMinutes();

    logger.info({ hour, minute }, "[JobOrchestrator] Iniciando ciclo de check...");

    const executions: Promise<any>[] = [];

    // --- AGENDAS DE FREQUÊNCIA E HORÁRIOS MIGRADO PARA BULLMQ NATIVO NA VPS ---
    // Os jobs agora são disparados internamente pelo cronWorker baseado no redis.
    
    if (executions.length === 0) {
      logger.info("[JobOrchestrator] Nada para rodar neste slot.");
      return { status: "idle" };
    }

    logger.info({ jobs: executions.length }, "[JobOrchestrator] Disparando jobs do slot...");
    
    const results = await Promise.allSettled(executions);
    
    return {
      status: "completed",
      jobsTriggered: executions.length,
      results: results.map(r => r.status)
    };
  }
};
