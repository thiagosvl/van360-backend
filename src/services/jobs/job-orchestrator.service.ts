import { logger } from "../../config/logger.js";
import { subscriptionService } from "../subscriptions/subscription.service.js";

export const jobOrchestratorService = {
  /**
   * Executa a rotina diária do sistema (Assinaturas, Mensalidades, etc)
   * A ser disparado por um CronJob (ex: VPS ou Vercel Cron)
   */
  async runDailyJobs() {
    logger.info("[JobOrchestrator] Iniciando rotina diária...");

    const executions = [
      subscriptionService.runDailyCheck().catch((err: any) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar assinaturas diárias");
        throw err;
      }),
      // Futuro: cobrancaService.processDailyBilling() (add-on de mensalidades automáticas)
    ];

    logger.info({ totalJobs: executions.length }, "[JobOrchestrator] Disparando jobs...");
    const results = await Promise.allSettled(executions);
    
    return {
      status: "completed",
      jobsTriggered: executions.length,
      results: results.map(r => r.status)
    };
  }
};
