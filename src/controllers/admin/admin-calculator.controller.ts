import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminCalculatorService } from "../../services/admin/admin-calculator.service.js";

export const adminCalculatorController = {
  async getBaseline(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const baseline = await adminCalculatorService.getBaseline();
      return reply.status(200).send(baseline);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminCalculatorController] Erro ao buscar baseline.");
      return reply.status(500).send({ error: "Erro ao buscar dados do baseline." });
    }
  },
};
