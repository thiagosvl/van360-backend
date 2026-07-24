import { adminVeiculoRepository } from "../../repositories/admin/admin-veiculo.repository.js";

export const adminVeiculoService = {
  async getVeiculosByUserId(userId: string) {
    return adminVeiculoRepository.listVeiculosByUserId(userId);
  },
};
