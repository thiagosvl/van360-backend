import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminPlanService } from "../../services/admin/admin-plan.service.js";
import { updatePlanSchema } from "../../schemas/admin.schema.js";

export const adminPlanController = {
  async getPlans(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const plans = await adminPlanService.listPlans();
      return reply.status(200).send(plans);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminPlanController] Erro ao listar planos.");
      return reply.status(500).send({ error: "Erro ao buscar planos." });
    }
  },

  async updatePlan(request: FastifyRequest, reply: FastifyReply) {
    try {
      const { id } = request.params as { id: string };
      const body = updatePlanSchema.parse(request.body);
      const result = await adminPlanService.updatePlan(id, body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminPlanController] Erro ao atualizar plano.");
      return reply.status(400).send({ error: error.message });
    }
  },
};
