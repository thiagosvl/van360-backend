import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { jobOrchestratorService } from "../services/jobs/job-orchestrator.service.js";
import { pixValidationMonitorJob } from "../services/jobs/pix-validation-monitor.job.js";
import { reconciliacaoEntradaJob } from "../services/jobs/reconciliacao-entrada.job.js";
import { repasseMonitorJob } from "../services/jobs/repasse-monitor.job.js";
import { repasseRetryJob } from "../services/jobs/repasse-retry.job.js";



export const jobsController = {
  // --- Jobs de Cobrança ---


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
