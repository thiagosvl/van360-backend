import { logger } from "../../config/logger.js";
import { subscriptionMonitorService } from "../subscriptions/subscription-monitor.service.js";
import { cobrancaService } from "../cobranca.service.js";
import { getConfigNumber } from "../configuracao.service.js";
import { ConfigKey } from "../../types/enums.js";
import { birthdayReminderJob } from "./birthday-reminder.job.js";

export const jobOrchestratorService = {
  async runDailyJobs() {
    logger.info("[JobOrchestrator] Iniciando rotina diária...");

    const daysBefore = await getConfigNumber(ConfigKey.SAAS_DIAS_ANTECEDENCIA_RENOVACAO, 5);

    // Fase 1: Processamento e Geração (Criar faturas e mensalidades novas)
    const phase1Executions = [
      subscriptionMonitorService.generateRenewalInvoices(daysBefore).catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao gerar faturas de renovação SaaS");
        throw err;
      }),
      cobrancaService.gerarCobrancasMensaisParaTodos().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar mensalidades de passageiros");
        throw err;
      })
    ];

    logger.info({ totalJobs: phase1Executions.length }, "[JobOrchestrator] Disparando jobs de Fase 1 (Geração)...");
    const phase1Results = await Promise.allSettled(phase1Executions);

    // Fase 2: Notificações (Alertas de vencimento, cobrança, aniversário)
    const phase2Executions = [
      subscriptionMonitorService.runDailyCheck().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao processar assinaturas diárias");
        throw err;
      }),
      cobrancaService.enviarNotificacoesDiarias().catch((err: Error) => {
        logger.error({ err }, "[JobOrchestrator] Erro ao enviar lembretes diários de cobrança");
        throw err;
      })
    ];

    const now = new Date();
    if (now.getDay() === 0) { // 0 = Domingo
        phase2Executions.push(
            birthdayReminderJob.runWeekly().catch((err: Error) => {
                logger.error({ err }, "[JobOrchestrator] Erro ao processar lembretes de aniversário semanais");
                throw err;
            })
        );
    }

    logger.info({ totalJobs: phase2Executions.length }, "[JobOrchestrator] Disparando jobs de Fase 2 (Notificação)...");
    const phase2Results = await Promise.allSettled(phase2Executions);
    
    return {
      status: "completed",
      jobsTriggered: phase1Executions.length + phase2Executions.length,
      results: {
          phase1: phase1Results.map(r => r.status),
          phase2: phase2Results.map(r => r.status)
      }
    };
  }
};
