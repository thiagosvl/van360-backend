import { adminRepasseRepository } from "../../repositories/admin/admin-repasse.repository.js";
import { motoristaFinanceiroRepository } from "../../repositories/motorista-financeiro.repository.js";
import { addToRepasseQueue } from "../../queues/repasse.queue.js";
import { ListAdminRepassesQuery } from "../../schemas/admin-repasse.schema.js";
import {
  AdminRepasseItemDTO,
  AdminRepasseKpisDTO,
  AdminRepasseListResponseDTO,
} from "../../types/dtos/admin-repasse.dto.js";
import { StatusRepasseEnum, ProvedorPagamentoEnum } from "../../types/enums.js";
import { AppError } from "../../errors/AppError.js";
import { logger } from "../../config/logger.js";

export const adminRepasseService = {
  async listRepasses(query: ListAdminRepassesQuery): Promise<AdminRepasseListResponseDTO> {
    const page = query.page || 1;
    const limit = query.limit || 25;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminRepasseRepository.listRepasses({
      from,
      to,
      dataInicio: query.data_inicio,
      dataFim: query.data_fim,
      status: query.status,
      motoristaId: query.motorista_id,
      search: query.search,
    });

    if (error) {
      logger.error({ error }, "[AdminRepasseService] Erro ao listar repasses.");
      throw new AppError("Erro ao buscar repasses no banco de dados.", 500);
    }

    const items: AdminRepasseItemDTO[] = (data || []).map((row: any) => ({
      id: row.id,
      cobranca_id: row.cobranca_id,
      motorista_id: row.motorista_id,
      passageiro_id: row.passageiro_id,
      provedor: row.provedor as ProvedorPagamentoEnum,
      valor_bruto: Number(row.valor_bruto),
      taxa_plataforma: Number(row.taxa_plataforma),
      tarifa_gateway_pix_in: Number(row.tarifa_gateway_pix_in),
      tarifa_gateway_saque: Number(row.tarifa_gateway_saque),
      valor_liquido_motorista: Number(row.valor_liquido_motorista),
      transacao_provedor_id: row.transacao_provedor_id,
      saque_provedor_id: row.saque_provedor_id,
      end_to_end_id_in: row.end_to_end_id_in,
      end_to_end_id_out: row.end_to_end_id_out,
      status_repasse: row.status_repasse as StatusRepasseEnum,
      tentativas: row.tentativas,
      ultimo_erro: row.ultimo_erro,
      data_pagamento_pai: row.data_pagamento_pai,
      data_repasse_motorista: row.data_repasse_motorista,
      created_at: row.created_at,
      updated_at: row.updated_at,
      motorista: {
        id: row.motorista?.id || row.motorista_id,
        nome: row.motorista?.nome || "Motorista Desconhecido",
        apelido: row.motorista?.apelido || null,
        telefone: row.motorista?.telefone || null,
        cpfcnpj: row.motorista?.cpfcnpj || null,
      },
      passageiro: {
        id: row.passageiro?.id || row.passageiro_id,
        nome: row.passageiro?.nome || "Aluno Desconhecido",
      },
      cobranca: {
        id: row.cobranca?.id || row.cobranca_id,
        valor: Number(row.cobranca?.valor || 0),
        status: row.cobranca?.status || "desconhecido",
        mes: Number(row.cobranca?.mes || 0),
        ano: Number(row.cobranca?.ano || 0),
        data_vencimento: row.cobranca?.data_vencimento || "",
      },
    }));

    return {
      data: items,
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getStats(filters: { data_inicio?: string; data_fim?: string; motorista_id?: string }): Promise<AdminRepasseKpisDTO> {
    return adminRepasseRepository.getStats({
      dataInicio: filters.data_inicio,
      dataFim: filters.data_fim,
      motoristaId: filters.motorista_id,
    });
  },

  async retryRepasse(id: string) {
    const { data: repasse, error } = await adminRepasseRepository.getById(id);

    if (error || !repasse) {
      throw new AppError("Registro de repasse não encontrado.", 404);
    }

    if (repasse.status_repasse === StatusRepasseEnum.SUCESSO) {
      throw new AppError("Este repasse já foi liquidado com sucesso.", 400);
    }

    const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(repasse.motorista_id);
    if (!motoristaConfig.chave_pix_repasse) {
      throw new AppError("O motorista não possui uma chave Pix configurada para repasse.", 400);
    }

    await adminRepasseRepository.resetForRetry(id);

    await addToRepasseQueue({
      repasseId: repasse.id,
      cobrancaId: repasse.cobranca_id,
      motoristaId: repasse.motorista_id,
      chavePix: motoristaConfig.chave_pix_repasse,
      valorLiquido: Number(repasse.valor_liquido_motorista),
      transacaoProvedorId: repasse.transacao_provedor_id,
    });

    logger.info({ repasseId: id, motoristaId: repasse.motorista_id }, "[AdminRepasseService] Repasse reenfileirado manualmente pelo Admin.");

    return {
      success: true,
      message: "Repasse reenfileirado para processamento imediato.",
    };
  },
};
