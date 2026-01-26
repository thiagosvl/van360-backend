import { logger } from "../../config/logger.js";
import { chargeGeneratorJob } from "./charge-generator.job.js";
import { dailyChargeMonitorJob } from "./daily-charge-monitor.job.js";
import { dailySubscriptionMonitorJob } from "./daily-subscription-monitor.job.js";
import { pixValidationMonitorJob } from "./pix-validation-monitor.job.js";
import { reconciliacaoEntradaJob } from "./reconciliacao-entrada.job.js";
import { repasseMonitorJob } from "./repasse-monitor.job.js";
import { repasseRetryJob } from "./repasse-retry.job.js";
import { subscriptionGeneratorJob } from "./subscription-generator.job.js";

export const jobOrchestratorService = {
  async runWorker() {
    const now = new Date();
    // Ajuste para Horário de Brasília (Vercel usa UTC)
    const brDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hour = brDate.getHours();
    const minute = brDate.getMinutes();

    logger.info({ hour, minute }, "[JobOrchestrator] Iniciando ciclo de check...");

    const executions: Promise<any>[] = [];

    // --- AGENDAS ESPECÍFICAS (HORÁRIO FIXO) ---
    // Usamos janelas de 15 minutos pois o GitHub Action pode atrasar um pouco

    // 06:00 - Reconciliação
    if (hour === 6 && minute < 15) {
      executions.push(reconciliacaoEntradaJob.run());
    }

    // 09:00 - Monitor Motoristas
    if (hour === 9 && minute < 15) {
      executions.push(dailySubscriptionMonitorJob.run());
    }

    // 11:00 - Geração de Cobranças Mensais e Renovações
    if (hour === 11 && minute < 15) {
      executions.push(chargeGeneratorJob.run());
      executions.push(subscriptionGeneratorJob.run());
    }

    // 12:00 - Monitor Passageiros
    if (hour === 12 && minute < 15) {
      executions.push(dailyChargeMonitorJob.run());
    }

    // --- AGENDAS DE FREQUÊNCIA (INTERVALOS) ---

    // A cada 15 min (Sempre roda se o GitHub chamar a cada 15 min)
    executions.push(repasseRetryJob.run());

    // A cada 30 min (Minute 0-15 or 30-45)
    if ((minute >= 0 && minute < 15) || (minute >= 30 && minute < 45)) {
      executions.push(repasseMonitorJob.run());
    }

    // A cada 1 hora (Minute 0-15)
    if (minute < 15) {
       executions.push(pixValidationMonitorJob.run());
    }



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
