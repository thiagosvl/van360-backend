import { supabaseAdmin } from "../../config/supabase.js";
import { FINANCEIRO_CONFIG } from "../../config/constants.js";
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
      const rawTerm = filters.search.trim();
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTerm);

      if (isUuid) {
        query = query.or(
          `id.eq.${rawTerm},motorista_id.eq.${rawTerm},cobranca_id.eq.${rawTerm},transacao_provedor_id.ilike.%${rawTerm}%,end_to_end_id_out.ilike.%${rawTerm}%`
        );
      } else {
        const sanitized = rawTerm.replace(/[,()"\\]/g, " ").replace(/\s+/g, " ").trim();
        const digits = rawTerm.replace(/\D/g, "");

        const userOrConditions: string[] = [];
        if (sanitized) {
          userOrConditions.push(`nome.ilike.%${sanitized}%`, `apelido.ilike.%${sanitized}%`);
        }
        if (digits && digits.length >= 3) {
          userOrConditions.push(`telefone.ilike.%${digits}%`, `cpfcnpj.ilike.%${digits}%`);
        }

        let matchedDriverIds: string[] = [];
        if (userOrConditions.length > 0) {
          const { data: matchedUsers } = await supabaseAdmin
            .from("usuarios")
            .select("id")
            .or(userOrConditions.join(","));

          matchedDriverIds = (matchedUsers || []).map((u) => u.id);
        }

        let matchedPassengerIds: string[] = [];
        if (sanitized) {
          const { data: matchedPassengers } = await supabaseAdmin
            .from("passageiros")
            .select("id")
            .ilike("nome", `%${sanitized}%`);

          matchedPassengerIds = (matchedPassengers || []).map((p) => p.id);
        }

        const repasseOrConditions: string[] = [];
        if (matchedDriverIds.length > 0) {
          repasseOrConditions.push(`motorista_id.in.(${matchedDriverIds.join(",")})`);
        }
        if (matchedPassengerIds.length > 0) {
          repasseOrConditions.push(`passageiro_id.in.(${matchedPassengerIds.join(",")})`);
        }
        if (sanitized) {
          repasseOrConditions.push(
            `transacao_provedor_id.ilike.%${sanitized}%`,
            `end_to_end_id_in.ilike.%${sanitized}%`,
            `end_to_end_id_out.ilike.%${sanitized}%`,
            `pagador_nome.ilike.%${sanitized}%`
          );
        }
        if (digits && digits.length >= 3) {
          repasseOrConditions.push(`pagador_documento.ilike.%${digits}%`);
        }

        if (repasseOrConditions.length > 0) {
          query = query.or(repasseOrConditions.join(","));
        }
      }
    }

    query = query.order("created_at", { ascending: false }).range(filters.from, filters.to);

    return query;
  },

  async getStats(filters: StatsRepassesFilters) {
    let query = supabaseAdmin
      .from("cobrancas_repasses")
      .select("status_repasse, valor_liquido_motorista, taxa_plataforma, tarifa_gateway_pix_in, tarifa_gateway_saque");

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
    let totalCustoProvedor = 0;
    let totalLucroLiquido = 0;
    let totalSucesso = 0;
    let totalFalhas = 0;
    let totalPendentes = 0;

    for (const row of data || []) {
      if (row.status_repasse === StatusRepasseEnum.SUCESSO) {
        totalSucesso++;
        totalRepassado += Number(row.valor_liquido_motorista || 0);
        const taxa = Number(row.taxa_plataforma || 0);
        totalTaxaPlataforma += taxa;

        const tarifaPixIn = Number(row.tarifa_gateway_pix_in) || FINANCEIRO_CONFIG.TARIFA_GATEWAY_PIX_IN;
        const tarifaSaque = Number(row.tarifa_gateway_saque) || FINANCEIRO_CONFIG.TARIFA_GATEWAY_SAQUE;
        const custoTransacao = tarifaPixIn + tarifaSaque;

        totalCustoProvedor += custoTransacao;
        totalLucroLiquido += (taxa - custoTransacao);
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
      total_custo_provedor: Number(totalCustoProvedor.toFixed(2)),
      total_lucro_liquido: Number(totalLucroLiquido.toFixed(2)),
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

  async delete(id: string) {
    return supabaseAdmin.from("cobrancas_repasses").delete().eq("id", id);
  },
};
