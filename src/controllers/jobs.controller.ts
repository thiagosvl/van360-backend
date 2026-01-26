import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { chargeGeneratorJob } from "../services/jobs/charge-generator.job.js";
import { dailyChargeMonitorJob } from "../services/jobs/daily-charge-monitor.job.js";
import { dailySubscriptionMonitorJob } from "../services/jobs/daily-subscription-monitor.job.js";
import { jobOrchestratorService } from "../services/jobs/job-orchestrator.service.js";
import { pixValidationMonitorJob } from "../services/jobs/pix-validation-monitor.job.js";
import { reconciliacaoEntradaJob } from "../services/jobs/reconciliacao-entrada.job.js";
import { repasseMonitorJob } from "../services/jobs/repasse-monitor.job.js";
import { repasseRetryJob } from "../services/jobs/repasse-retry.job.js";
import { subscriptionGeneratorJob } from "../services/jobs/subscription-generator.job.js";



export const jobsController = {
  // --- Jobs de Cobrança ---
  generateMonthlyCharges: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        logger.info("JobsController.generateMonthlyCharges - Triggered");
        const body = request.body as { force?: boolean; targetMonth?: number; targetYear?: number } || {};
        const result = await chargeGeneratorJob.run(body);
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job generate-monthly-charges");
        return reply.code(500).send({ error: error.message });
    }
  },

  passengerMonitor: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        logger.info("JobsController.passengerMonitor - Triggered");
        const body = request.body as { force?: boolean; diasAntecedenciaOverride?: number } || {};
        const result = await dailyChargeMonitorJob.run(body);
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job passenger-monitor");
        return reply.code(500).send({ error: error.message });
    }
  },

  driverMonitor: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        logger.info("JobsController.driverMonitor - Triggered");
        const body = request.body as { force?: boolean; diasAntecedenciaOverride?: number } || {};
        const result = await dailySubscriptionMonitorJob.run(body);
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job driver-monitor");
        return reply.code(500).send({ error: error.message });
    }
  },

  generateSubscriptionRenewals: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const body = request.body as { force?: boolean; targetMonth?: number; targetYear?: number } || {};
        const result = await subscriptionGeneratorJob.run(body);
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job generate-subscription-renewals");
        return reply.code(500).send({ error: error.message });
    }
  },

  pixValidationMonitor: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        await pixValidationMonitorJob.run();
        return reply.send({ success: true, message: "Monitoramento de validações PIX executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job pix-validation-monitor");
        return reply.code(500).send({ error: error.message });
    }
  },

  repasseMonitor: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        await repasseMonitorJob.run();
        return reply.send({ success: true, message: "Monitoramento de repasses executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job repasse-monitor");
        return reply.code(500).send({ error: error.message });
    }
  },

  repasseRetry: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        await repasseRetryJob.run();
        return reply.send({ success: true, message: "Retry de repasses executado" });
    } catch (error: any) {
        logger.error({ error }, "Erro no Job repasse-retry");
        return reply.code(500).send({ error: error.message });
    }
  },

  reconciliacaoEntrada: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const result = await reconciliacaoEntradaJob.run();
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Job reconciliacao-entrada");
        return reply.code(500).send({ error: error.message });
    }
  },



  runOrchestrator: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        const result = await jobOrchestratorService.runWorker();
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Orquestrador de Jobs");
        return reply.code(500).send({ error: error.message });
    }
  }
};
