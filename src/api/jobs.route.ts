import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { chargeGeneratorJob } from "../services/jobs/charge-generator.job.js";
import { dailyChargeMonitorJob } from "../services/jobs/daily-charge-monitor.job.js";

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
   * Job: Gerar Cobranças Mensais
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
   * Job: Monitoramento Diário de Cobranças (Vencendo, Hoje, Atrasadas)
   * Trigger: Diário (ex: 08:00 AM)
   */
  app.post<{ Body: { force?: boolean; diasAntecedenciaOverride?: number } }>("/daily-monitor", async (request, reply) => {
    try {
        const result = await dailyChargeMonitorJob.run(request.body || {});
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job daily-monitor");
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
