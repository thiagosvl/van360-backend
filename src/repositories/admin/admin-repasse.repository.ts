import { supabaseAdmin } from "../../config/supabase.js";
import { StatusRepasseEnum } from "../../types/enums.js";
import { toStartOfDayISO, toEndOfDayISO } from "../../utils/date.utils.js";

export interface ListRepassesFilters {
  from: number;
  to: number;
  dataInicio?: string;
  dataFim?: string;
  status?: string;
  motoristaId?: string;
  search?: string;
}

export interface StatsRepassesFilters {
  dataInicio?: string;
  dataFim?: string;
  motoristaId?: string;
}

export const adminRepasseRepository = {
  async listRepasses(filters: ListRepassesFilters) {
    let query = supabaseAdmin
      .from("cobrancas_repasses")
      .select(
        `
        *,
        motorista:usuarios!cobrancas_repasses_motorista_id_fkey (id, nome, apelido, telefone, cpfcnpj),
        passageiro:passageiros!cobrancas_repasses_passageiro_id_fkey (id, nome),
        cobranca:cobrancas!cobrancas_repasses_cobranca_id_fkey (id, valor, status, mes, ano, data_vencimento)
      `,
        { count: "exact" }
      );

    if (filters.motoristaId) {
      query = query.eq("motorista_id", filters.motoristaId);
    }

    if (filters.status && filters.status !== "TODOS") {
      query = query.eq("status_repasse", filters.status as StatusRepasseEnum);
    }

    if (filters.dataInicio) {
      query = query.gte("created_at", toStartOfDayISO(filters.dataInicio));
    }

    if (filters.dataFim) {
      query = query.lte("created_at", toEndOfDayISO(filters.dataFim));
    }

    if (filters.search && filters.search.trim()) {
      const term = filters.search.trim();
      query = query.or(
        `transacao_provedor_id.ilike.%${term}%,end_to_end_id_out.ilike.%${term}%`
      );
    }

    query = query.order("created_at", { ascending: false }).range(filters.from, filters.to);

    return query;
  },

  async getStats(filters: StatsRepassesFilters) {
    let query = supabaseAdmin
      .from("cobrancas_repasses")
      .select("status_repasse, valor_liquido_motorista, taxa_plataforma");

    if (filters.motoristaId) {
      query = query.eq("motorista_id", filters.motoristaId);
    }

    if (filters.dataInicio) {
      query = query.gte("created_at", toStartOfDayISO(filters.dataInicio));
    }

    if (filters.dataFim) {
      query = query.lte("created_at", toEndOfDayISO(filters.dataFim));
    }

    const { data, error } = await query;
    if (error) throw error;

    let totalRepassado = 0;
    let totalTaxaPlataforma = 0;
    let totalSucesso = 0;
    let totalFalhas = 0;
    let totalPendentes = 0;

    for (const row of data || []) {
      if (row.status_repasse === StatusRepasseEnum.SUCESSO) {
        totalSucesso++;
        totalRepassado += Number(row.valor_liquido_motorista || 0);
        totalTaxaPlataforma += Number(row.taxa_plataforma || 0);
      } else if (row.status_repasse === StatusRepasseEnum.FALHA) {
        totalFalhas++;
      } else if (
        row.status_repasse === StatusRepasseEnum.PENDENTE ||
        row.status_repasse === StatusRepasseEnum.PROCESSANDO
      ) {
        totalPendentes++;
      }
    }

    return {
      total_repassado: Number(totalRepassado.toFixed(2)),
      total_taxa_plataforma: Number(totalTaxaPlataforma.toFixed(2)),
      total_sucesso: totalSucesso,
      total_falhas: totalFalhas,
      total_pendentes: totalPendentes,
    };
  },

  async getById(id: string) {
    return supabaseAdmin
      .from("cobrancas_repasses")
      .select(
        `
        *,
        motorista:usuarios!cobrancas_repasses_motorista_id_fkey (id, nome, apelido, telefone, cpfcnpj),
        passageiro:passageiros!cobrancas_repasses_passageiro_id_fkey (id, nome),
        cobranca:cobrancas!cobrancas_repasses_cobranca_id_fkey (id, valor, status, mes, ano, data_vencimento)
      `
      )
      .eq("id", id)
      .single();
  },

  async resetForRetry(id: string) {
    return supabaseAdmin
      .from("cobrancas_repasses")
      .update({
        status_repasse: StatusRepasseEnum.PENDENTE,
        ultimo_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
  },
};
