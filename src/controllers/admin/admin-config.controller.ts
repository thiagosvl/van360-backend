import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminConfigService } from "../../services/admin/admin-config.service.js";
import { updateConfigSchema } from "../../schemas/admin.schema.js";

export const adminConfigController = {
  async getConfigs(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const configs = await adminConfigService.listConfigs();
      return reply.status(200).send(configs);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminConfigController] Erro ao listar configs.");
      return reply.status(500).send({ error: "Erro ao buscar configurações." });
    }
  },

  async updateConfig(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = updateConfigSchema.parse(request.body);
      const result = await adminConfigService.updateConfig(body.chave, body.valor);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminConfigController] Erro ao atualizar config.");
      return reply.status(400).send({ error: error.message });
    }
  },
};
