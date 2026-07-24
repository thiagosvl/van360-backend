import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminLogService } from "../../services/admin/admin-log.service.js";
import { listUserLogsQuerySchema, listGlobalLogsQuerySchema } from "../../schemas/admin.schema.js";

export const adminLogController = {
  async getUserLogs(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const query = listUserLogsQuerySchema.parse(request.query);
      const result = await adminLogService.getUserLogs(id, query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, id }, "[AdminLogController] Erro ao buscar logs de atividades.");
      return reply.status(500).send({ error: "Erro ao buscar logs de atividades." });
    }
  },

  async getGlobalLogs(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listGlobalLogsQuerySchema.parse(request.query);
      const result = await adminLogService.getGlobalLogs(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminLogController] Erro ao buscar logs globais.");
      return reply.status(500).send({ error: "Erro ao buscar logs globais." });
    }
  },
};
