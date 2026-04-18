import { logger } from "../../config/logger.js";
import { subscriptionMonitorService } from "../subscriptions/subscription-monitor.service.js";
import { cobrancaService } from "../cobranca.service.js";

export const jobOrchestratorService = {
  /**
   * Executa a rotina diária do sistema (Assinaturas, Mensalidades, etc)
   * A ser disparado por um CronJob (ex: VPS ou Vercel Cron)
   */
  async runDailyJobs() {
    logger.info("[JobOrchestrator] Iniciando rotina diária...");

    const executions = [
      subscriptionMonitorService.runDailyCheck().catch((err: any) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar assinaturas diárias");
        throw err;
      }),
      cobrancaService.gerarCobrancasMensaisParaTodos().catch((err: any) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar mensalidades de passageiros");
        throw err;
      })
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
