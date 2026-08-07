import { logger } from "../../config/logger.js";
import { adminWhatsappRepository } from "../../repositories/admin/admin-whatsapp.repository.js";
import { whatsappService } from "../evolution.service.js";
import { EvolutionConnectionStatus } from "../../types/enums.js";

export const adminWhatsappService = {
  async getWhatsappInstances() {
    const { data, error } = await adminWhatsappRepository.getWhatsappInstances();
    if (error) {
      logger.error({ error }, "[AdminWhatsappService] Erro ao buscar instâncias de WhatsApp.");
      throw error;
    }

    const enhancedData = await Promise.all(
      (data || []).map(async (instance) => {
        try {
          const status = await whatsappService.getInstanceStatus(instance.instance_name);
          return {
            ...instance,
            evolution_status: status.state || EvolutionConnectionStatus.UNKNOWN,
            evolution_status_reason: status.statusReason,
          };
        } catch (err) {
          logger.warn(
            { error: err, instance_name: instance.instance_name },
            "[AdminWhatsappService] Erro ao consultar live status no Evolution API."
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
