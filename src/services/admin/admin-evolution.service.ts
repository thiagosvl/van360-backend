import { logger } from "../../config/logger.js";
import { adminWhatsappRepository } from "../../repositories/admin/admin-whatsapp.repository.js";
import { evolutionService } from "../evolution.service.js";
import { EvolutionConnectionStatus } from "../../types/enums.js";

export const adminEvolutionService = {
  async getWhatsappInstances() {
    const { data, error } = await adminWhatsappRepository.getWhatsappInstances();
    if (error) {
      logger.error({ error }, "[AdminEvolutionService] Erro ao buscar instâncias de WhatsApp.");
      throw error;
    }

    const enhancedData = await Promise.all(
      (data || []).map(async (instance) => {
        try {
          const status = await evolutionService.getInstanceStatus(instance.instance_name);
          return {
            ...instance,
            evolution_status: status.state || EvolutionConnectionStatus.UNKNOWN,
            evolution_status_reason: status.statusReason,
          };
        } catch (err) {
          logger.warn(
            { error: err, instance_name: instance.instance_name },
            "[AdminEvolutionService] Erro ao consultar live status no Evolution API."
          );
          return {
            ...instance,
            evolution_status: EvolutionConnectionStatus.UNKNOWN,
          };
        }
      })
    );

    return enhancedData;
  },
};
