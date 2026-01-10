import { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { jobsController } from "../controllers/jobs.controller.js";

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



  app.post("/gerar-cobrancas-mensais", jobsController.generateMonthlyCharges); // /generate-monthly-charges
  
  app.post("/monitor-passageiros", jobsController.passengerMonitor); // /jobs/monitor-passageiros
  
  app.post("/monitor-motoristas", jobsController.driverMonitor); // /jobs/monitor-motoristas
  
  app.post("/gerar-renovacoes-assinatura", jobsController.generateSubscriptionRenewals); // /generate-subscription-renewals
  
  app.post("/monitor-validacao-pix", jobsController.pixValidationMonitor); // /jobs/monitor-validacao-pix
  
  app.post("/monitor-repasses", jobsController.repasseMonitor); // /jobs/monitor-repasses
  
  app.post("/retry-repasses", jobsController.repasseRetry); // /jobs/retry-repasses
  
  app.post("/reconciliacao-entrada", jobsController.reconciliacaoEntrada);
  
  app.post("/whatsapp-health-check", jobsController.whatsappHealthCheck);

}
