import { logger } from "../../config/logger.js";
import { subscriptionMonitorService } from "../subscriptions/subscription-monitor.service.js";
import { cobrancaService } from "../cobranca.service.js";
import { getConfigNumber } from "../configuracao.service.js";
import { ConfigKey } from "../../types/enums.js";

export const jobOrchestratorService = {
  async runDailyJobs() {
    logger.info("[JobOrchestrator] Iniciando rotina diária...");

    const daysBefore = await getConfigNumber(ConfigKey.SAAS_DIAS_ANTECEDENCIA_RENOVACAO, 5);

    const executions = [
      subscriptionMonitorService.runDailyCheck().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar assinaturas diárias");
        throw err;
      }),
      subscriptionMonitorService.generateRenewalInvoices(daysBefore).catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao gerar faturas de renovação SaaS");
        throw err;
      }),
      cobrancaService.gerarCobrancasMensaisParaTodos().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar mensalidades de passageiros");
        throw err;
      }),
      cobrancaService.enviarNotificacoesDiarias().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao enviar lembretes diários de cobrança");
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
