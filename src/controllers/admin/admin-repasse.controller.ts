import { FastifyReply, FastifyRequest } from "fastify";
import { adminRepasseService } from "../../services/admin/admin-repasse.service.js";
import { listAdminRepassesQuerySchema } from "../../schemas/admin-repasse.schema.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../errors/AppError.js";

export const adminRepasseController = {
  async list(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listAdminRepassesQuerySchema.parse(request.query);
      const result = await adminRepasseService.listRepasses(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminRepasseController] Erro ao listar repasses.");
      return reply.status(500).send({ error: "Erro ao buscar repasses." });
    }
  },

  async getStats(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = request.query as { data_inicio?: string; data_fim?: string; motorista_id?: string };
      const stats = await adminRepasseService.getStats(query);
      return reply.status(200).send(stats);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminRepasseController] Erro ao buscar métricas de repasses.");
      return reply.status(500).send({ error: "Erro ao buscar métricas de repasses." });
    }
  },

  async retry(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const result = await adminRepasseService.retryRepasse(id);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      if (err instanceof AppError) {
        return reply.status(err.statusCode).send({ error: err.message });
      }
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminRepasseController] Erro ao retentar repasse.");
      return reply.status(500).send({ error: "Erro ao processar retentativa de repasse." });
    }
  },
};
