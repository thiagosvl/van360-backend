import { logger } from "../../config/logger.js";
import { adminLogRepository } from "../../repositories/admin/admin-log.repository.js";
import type { ListUserLogsQuery, ListGlobalLogsQuery, ListLogsByUserQuery } from "../../schemas/admin.schema.js";
import type { AdminLogsByUserResponseDTO, AdminUserGroupLogItemDTO, AdminLogItemDTO } from "../../types/dtos/admin-log.dto.js";

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

  async getLogsByUser(query: ListLogsByUserQuery): Promise<AdminLogsByUserResponseDTO> {
    const { page, limit, dataInicio, dataFim, acao, entidade, search_cpf } = query;
    const offset = (page - 1) * limit;

    const { data, error } = await adminLogRepository.getLogsByUser({
      dataInicio,
      dataFim,
      acao,
      entidade,
      search_cpf,
      limit,
      offset,
    });

    if (error) {
      logger.error({ error }, "[AdminLogService] Erro ao buscar logs agrupados por usuário.");
      throw error;
    }

    const rows = (data || []) as Array<{
      usuario_id: string;
      usuario_nome: string | null;
      usuario_apelido: string | null;
      usuario_telefone: string | null;
      usuario_email: string | null;
      total_atividades: number | string;
      primeira_atividade_em: string | null;
      ultima_atividade_em: string | null;
      ultimas_atividades: AdminLogItemDTO[];
      total_usuarios: number | string;
    }>;

    const total = rows.length > 0 ? Number(rows[0].total_usuarios) : 0;

    const mappedData: AdminUserGroupLogItemDTO[] = rows.map((r) => ({
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario_nome,
      usuario_apelido: r.usuario_apelido,
      usuario_telefone: r.usuario_telefone,
      usuario_email: r.usuario_email,
      total_atividades: Number(r.total_atividades),
      primeira_atividade_em: r.primeira_atividade_em,
      ultima_atividade_em: r.ultima_atividade_em,
      ultimas_atividades: Array.isArray(r.ultimas_atividades) ? r.ultimas_atividades : [],
    }));

    return {
      data: mappedData,
      total,
      page,
      limit,
    };
  },
};
