import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { jobOrchestratorService } from "../services/jobs/job-orchestrator.service.js";

export const jobsController = {
  // --- Novo Orquestrador de Tarefas Diárias (Assinaturas, Mensalidades, Notificações) ---
  runDailyRoutine: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
        logger.info("[jobsController] Iniciando rotina diária (runDailyRoutine)...");
        const result = await jobOrchestratorService.runDailyJobs();
        return reply.send(result);
    } catch (error: any) {
        logger.error({ error }, "Erro no Orquestrador de Tarefas Diárias");
        return reply.code(500).send({ error: error.message });
    }
  }
};
