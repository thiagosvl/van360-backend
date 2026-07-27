import { logger } from "../../config/logger.js";
import { adminPlanRepository } from "../../repositories/admin/admin-plan.repository.js";
import type { UpdatePlanDTO } from "../../schemas/admin.schema.js";

export const adminPlanService = {
  async listPlans() {
    const { data, error } = await adminPlanRepository.listPlanos();
    if (error) {
      logger.error({ error }, "[AdminPlanService] Erro ao listar planos.");
      throw error;
    }
    return data || [];
  },

  async updatePlan(id: string, body: UpdatePlanDTO) {
    const updateData: Record<string, unknown> = {};
    if (body.valor !== undefined) updateData.valor = body.valor;
    if (body.valor_promocional !== undefined) updateData.valor_promocional = body.valor_promocional;

    const { data, error } = await adminPlanRepository.updatePlano(id, updateData);
    if (error) {
      logger.error({ error, id }, "[AdminPlanService] Erro ao atualizar plano.");
      throw error;
    }
    return data;
  },
};
