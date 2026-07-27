import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminLoginAttemptsService } from "../../services/admin/admin-login-attempts.service.js";
import { listLoginAttemptsQuerySchema } from "../../schemas/admin.schema.js";

export const adminLoginAttemptsController = {
  async getLoginAttempts(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listLoginAttemptsQuerySchema.parse(request.query);
      const result = await adminLoginAttemptsService.getLoginAttempts(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminLoginAttemptsController] Erro ao buscar tentativas de login.");
      return reply.status(500).send({ error: "Erro ao buscar tentativas de login." });
    }
  },
};
