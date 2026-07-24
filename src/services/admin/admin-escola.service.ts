import { adminEscolaRepository } from "../../repositories/admin/admin-escola.repository.js";

export const adminEscolaService = {
  async getEscolasByUserId(userId: string) {
    return adminEscolaRepository.listEscolasByUserId(userId);
  },
};
