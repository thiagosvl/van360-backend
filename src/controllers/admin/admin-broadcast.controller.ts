import { FastifyRequest, FastifyReply } from "fastify";
import { adminBroadcastService } from "../../services/admin/admin-broadcast.service.js";
import {
  adminBroadcastEstimateQuerySchema,
  adminBroadcastSendSchema,
} from "../../schemas/admin-broadcast.schema.js";
import { logger } from "../../config/logger.js";

export const adminBroadcastController = {
  async estimate(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = adminBroadcastEstimateQuerySchema.parse(request.query);
      const result = await adminBroadcastService.estimateReach({
        statusList: query.status,
        driverIds: query.motoristaIds,
      });
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminBroadcastController] Erro ao estimar alcance.");
      return reply.status(400).send({ error: error.message });
    }
  },

  async send(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = adminBroadcastSendSchema.parse(request.body);
      const result = await adminBroadcastService.sendBroadcast(body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminBroadcastController] Erro ao enviar broadcast.");
      return reply.status(400).send({ error: error.message });
    }
  },
};
