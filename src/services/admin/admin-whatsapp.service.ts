import { logger } from "../../config/logger.js";
import { adminWhatsappRepository } from "../../repositories/admin/admin-whatsapp.repository.js";

export const adminWhatsappService = {
  async getWhatsappInstances() {
    const { data, error } = await adminWhatsappRepository.getWhatsappInstances();
    if (error) {
      logger.error({ error }, "[AdminWhatsappService] Erro ao buscar instâncias de WhatsApp.");
      throw error;
    }
    return data || [];
  },
};
