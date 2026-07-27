import { logger } from "../../config/logger.js";
import { adminConfigRepository } from "../../repositories/admin/admin-config.repository.js";

export const adminConfigService = {
  async listConfigs() {
    const { data, error } = await adminConfigRepository.listConfigs();
    if (error) {
      logger.error({ error }, "[AdminConfigService] Erro ao listar configurações.");
      throw error;
    }
    return data || [];
  },

  async updateConfig(chave: string, valor: string) {
    const { data, error } = await adminConfigRepository.updateConfig(chave, valor);
    if (error) {
      logger.error({ error, chave }, "[AdminConfigService] Erro ao atualizar configuração.");
      throw error;
    }
    return data;
  },
};
