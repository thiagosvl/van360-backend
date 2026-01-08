import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { chargeGeneratorJob } from "../services/jobs/charge-generator.job.js";
import { dailyChargeMonitorJob } from "../services/jobs/daily-charge-monitor.job.js";
import { dailySubscriptionMonitorJob } from "../services/jobs/daily-subscription-monitor.job.js";
import { pixValidationMonitorJob } from "../services/jobs/pix-validation-monitor.job.js";
import { reconciliacaoEntradaJob } from "../services/jobs/reconciliacao-entrada.job.js";
import { repasseMonitorJob } from "../services/jobs/repasse-monitor.job.js";
import { repasseRetryJob } from "../services/jobs/repasse-retry.job.js";
import { subscriptionGeneratorJob } from "../services/jobs/subscription-generator.job.js";

export async function jobsRoute(app: FastifyInstance) {
  
  // Middleware de segurança simples para Cron Jobs
  app.addHook("preHandler", async (request, reply) => {
    const authHeader = request.headers["authorization"];
    // Suporta "Bearer <token>" ou apenas "<token>"
    const token = authHeader?.replace("Bearer ", "");

    if (token !== env.CRON_SECRET) {
      logger.warn({ ip: request.ip }, "Tentativa de acesso não autorizado a /jobs");
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });

  app.get("/health", async () => {
    return { status: "Jobs Service Operational" };
  });

  /**
   * Job: Gerar Cobranças Mensais (Passageiros)
   * Trigger: Mensal (ex: dia 1 ou dia do fechamento)
   */
  app.post<{ Body: { force?: boolean; targetMonth?: number; targetYear?: number } }>("/generate-monthly-charges", async (request, reply) => {
    try {
        const result = await chargeGeneratorJob.run(request.body || {});
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job generate-monthly-charges");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Monitoramento de Cobranças (Passageiros)
   * Trigger: Diário (ex: 09:00 AM)
   */
  app.post<{ Body: { force?: boolean; diasAntecedenciaOverride?: number } }>("/jobs/passenger-monitor", async (request, reply) => {
    try {
        const result = await dailyChargeMonitorJob.run(request.body || {});
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job passager-monitor");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Monitoramento de Assinaturas (Motoristas)
   * Trigger: Diário (ex: 06:00 AM)
   */
  app.post<{ Body: { force?: boolean; diasAntecedenciaOverride?: number } }>("/jobs/driver-monitor", async (request, reply) => {
    try {
        const result = await dailySubscriptionMonitorJob.run(request.body || {});
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job driver-monitor");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Gerar Renovação de Assinaturas (Motoristas)
   * Trigger: Mensal (dia 25)
   */
  app.post<{ Body: { force?: boolean; targetMonth?: number; targetYear?: number } }>("/generate-subscription-renewals", async (request, reply) => {
    try {
        const result = await subscriptionGeneratorJob.run(request.body || {});
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job generate-subscription-renewals");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Monitoramento de Validações PIX
   * Trigger: Hora em Hora (ou mais frequente)
   */
  app.post("/jobs/pix-validation-monitor", async (request, reply) => {
    try {
        await pixValidationMonitorJob.run();
        return reply.send({ success: true, message: "Monitoramento de validações PIX executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job pix-validation-monitor");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Monitoramento de Repasses (Transferências)
   * Trigger: Hora em Hora
   */
  app.post("/jobs/repasse-monitor", async (request, reply) => {
    try {
        await repasseMonitorJob.run();
        return reply.send({ success: true, message: "Monitoramento de repasses executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job repasse-monitor");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Retry de Repasses (Fila de Acumulados)
   * Trigger: Diário ou Hora em Hora
   */
  app.post("/jobs/repasse-retry", async (request, reply) => {
    try {
        await repasseRetryJob.run();
        return reply.send({ success: true, message: "Retry de repasses executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job repasse-retry");
        return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Job: Reconciliação de Entradas (Recebimentos PIX)
   * Trigger: Diário (Madrugada)
   */
  app.post("/jobs/reconciliacao-entrada", async (request, reply) => {
    try {
        const result = await reconciliacaoEntradaJob.run();
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job reconciliacao-entrada");
        return reply.code(500).send({ error: error.message });
    }
  });

  // Deprecated Alias
  app.post("/notify-due-soon", async (request, reply) => {
      // Redireciona para a nova lógica
      const result = await dailyChargeMonitorJob.run(request.body as any || {});
      return reply.send(result);
  });

}
