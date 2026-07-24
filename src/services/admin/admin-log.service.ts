import { logger } from "../../config/logger.js";
import { adminLogRepository } from "../../repositories/admin/admin-log.repository.js";
import type { ListUserLogsQuery, ListGlobalLogsQuery } from "../../schemas/admin.schema.js";

export const adminLogService = {
  async getUserLogs(userId: string, query: ListUserLogsQuery) {
    const { page, limit, dataInicio, dataFim, acao, entidade } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminLogRepository.getUserLogs(
      userId,
      from,
      to,
      { dataInicio, dataFim, acao, entidade }
    );

    if (error) {
      logger.error({ error, userId }, "[AdminLogService] Erro ao buscar logs de atividades do usuário.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getGlobalLogs(query: ListGlobalLogsQuery) {
    const { page, limit, dataInicio, dataFim, acao, entidade, search_cpf } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminLogRepository.getGlobalLogs(
      from,
      to,
      { dataInicio, dataFim, acao, entidade, search_cpf }
    );

    if (error) {
      logger.error({ error }, "[AdminLogService] Erro ao buscar logs globais.");
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
