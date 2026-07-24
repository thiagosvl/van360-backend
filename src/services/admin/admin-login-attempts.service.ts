import { logger } from "../../config/logger.js";
import { loginAttemptsRepository } from "../../repositories/login-attempts.repository.js";

export const adminLoginAttemptsService = {
  async getLoginAttempts(query: { page?: number; limit?: number; data_inicio?: string; data_fim?: string; search_cpf?: string }) {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await loginAttemptsRepository.listAttempts(query, from, to);

    if (error) {
      logger.error({ error }, "[AdminLoginAttemptsService] Erro ao buscar tentativas de login.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },
};
