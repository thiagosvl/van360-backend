import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminFinancialService } from "../../services/admin/admin-financial.service.js";

export const adminFinancialController = {
  async getFinancialStats(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await adminFinancialService.getFinancialStats();
      return reply.status(200).send(stats);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, stack: error.stack }, "[AdminFinancialController] Erro ao buscar métricas financeiras.");
      return reply.status(500).send({ error: "Erro ao buscar métricas financeiras administrativas." });
    }
  },

  async getDemographicsStats(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const stats = await adminFinancialService.getDemographicsStats();
      return reply.status(200).send(stats);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, stack: error.stack }, "[AdminFinancialController] Erro ao buscar demografia e funil.");
      return reply.status(500).send({ error: "Erro ao buscar demografia e funil administrativos." });
    }
  }
};
