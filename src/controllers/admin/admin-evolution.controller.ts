import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminEvolutionService } from "../../services/admin/admin-evolution.service.js";

export const adminWhatsappController = {
  async getWhatsappInstances(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const instances = await adminEvolutionService.getWhatsappInstances();
      return reply.status(200).send(instances);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminEvolutionController] Erro ao buscar instâncias de WhatsApp.");
      return reply.status(500).send({ error: "Erro ao buscar instâncias de WhatsApp." });
    }
  },
};
