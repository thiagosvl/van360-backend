import { adminPassageiroRepository } from "../../repositories/admin/admin-passageiro.repository.js";

export const adminPassageiroService = {
  async getPassageirosByUserId(userId: string) {
    return adminPassageiroRepository.listPassageirosByUserId(userId);
  },

  async getPrePassageirosByUserId(userId: string) {
    return adminPassageiroRepository.listPrePassageirosByUserId(userId);
  },
};
