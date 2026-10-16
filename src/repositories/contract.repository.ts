import { supabaseAdmin } from "../config/supabase.js";
import { ContratoStatus } from "../types/enums.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

const CONTRACT_PASSAGEIRO_SELECT = `
  id, nome, ativo, valor_cobranca, dia_vencimento, data_inicio_transporte, data_fim_transporte,
  responsaveis:passageiro_responsaveis(
    tipo, parentesco,
    responsavel:responsaveis(id, nome, cpf, email, telefone)
  )
`;

export const contractRepository = {
  async getByToken(tokenAcesso: string) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenAcesso);
    let query = supabaseAdmin
      .from("contratos")
      .select(`*, usuario:usuarios(id, nome, apelido, razao_social, cpfcnpj, telefone, email, logo_url), passageiro:passageiros(${CONTRACT_PASSAGEIRO_SELECT})`);

    if (isUuid) {
      query = query.or(`token_acesso.eq.${tokenAcesso},id.eq.${tokenAcesso}`);
    } else {
      query = query.eq("token_acesso", tokenAcesso);
    }

    const { data, error } = await query.maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new Error("Contrato não encontrado");
    }
    return data;
  },

  async getById(id: string, usuarioId: string) {
    const { data, error } = await supabaseAdmin
      .from("contratos")
      .select(`*, passageiro:passageiros(${CONTRACT_PASSAGEIRO_SELECT})`)
      .eq("id", id)
      .eq("usuario_id", usuarioId)
      .single();

    if (error) throw error;
    return data;
  },

  async getMinutaAndData(id: string) {
    return supabaseAdmin
      .from("contratos")
      .select("minuta_url, dados_contrato")
      .eq("id", id)
      .single();
  },

  async getBasicStatus(id: string) {
    return supabaseAdmin
      .from("contratos")
      .select("*")
      .eq("id", id)
      .single();
  },

  async getStatusByToken(tokenAcesso: string): Promise<{ id: string; status: ContratoStatus } | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tokenAcesso);
    let query = supabaseAdmin
      .from("contratos")
      .select("id, status");

    if (isUuid) {
      query = query.or(`token_acesso.eq.${tokenAcesso},id.eq.${tokenAcesso}`);
    } else {
      query = query.eq("token_acesso", tokenAcesso);
    }

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return data as { id: string; status: ContratoStatus };
  },

  async getLatestStatusByPassageiroId(passageiroId: string): Promise<{ id: string; status: ContratoStatus } | null> {
    const { data, error } = await supabaseAdmin
      .from("contratos")
      .select("id, status")
      .eq("passageiro_id", passageiroId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as { id: string; status: ContratoStatus };
  },

  async getByPassageiroEAno(passageiroId: string, ano: number) {
    const { data, error } = await supabaseAdmin
      .from("contratos")
      .select("id, status, token_acesso, created_at, ano")
      .eq("passageiro_id", passageiroId)
      .eq("ano", ano)
      .in("status", [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getFinalUrl(id: string) {
    return supabaseAdmin
      .from("contratos")
      .select("contrato_final_url")
      .eq("id", id)
      .single();
  },

  async getActivePassageiroIdsForYear(usuarioId: string, ano?: number): Promise<string[] | null> {
    if (ano === undefined || ano === null) return null;
    const { data } = await supabaseAdmin
      .from("passageiro_matriculas")
      .select("passageiro_id")
      .eq("usuario_id", usuarioId)
      .eq("ano_letivo", ano)
      .eq("ativo", true);
    return (data || []).map((m) => m.passageiro_id);
  },

  async getPassageirosIdsComContratoValido(usuarioId: string, ano?: number) {
    let query = supabaseAdmin
      .from("contratos")
      .select("passageiro_id")
      .eq("usuario_id", usuarioId)
      .in("status", [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO]);

    if (ano !== undefined && ano !== null) {
      query = query.eq("ano", ano);
    }

    const { data } = await query;
    return data?.map((c) => c.passageiro_id) || [];
  },

  async getKPIs(usuarioId: string, ano?: number) {
    const activeIdsForYear = await this.getActivePassageiroIdsForYear(usuarioId, ano);
    if (activeIdsForYear !== null && activeIdsForYear.length === 0) {
      return { pendentes: 0, assinados: 0 };
    }

    let pendentesQuery = supabaseAdmin
      .from("contratos")
      .select("id, passageiros!inner(ativo)", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("status", ContratoStatus.PENDENTE);

    let assinadosQuery = supabaseAdmin
      .from("contratos")
      .select("id, passageiros!inner(ativo)", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("status", ContratoStatus.ASSINADO);

    if (ano !== undefined && ano !== null && activeIdsForYear !== null) {
      pendentesQuery = pendentesQuery.eq("ano", ano).in("passageiro_id", activeIdsForYear);
      assinadosQuery = assinadosQuery.eq("ano", ano).in("passageiro_id", activeIdsForYear);
    } else {
      pendentesQuery = pendentesQuery.eq("passageiros.ativo", true);
      assinadosQuery = assinadosQuery.eq("passageiros.ativo", true);
    }

    const [{ count: pendentes }, { count: assinados }] = await Promise.all([
      pendentesQuery,
      assinadosQuery,
    ]);

    return { pendentes: pendentes || 0, assinados: assinados || 0 };
  },

  async getSemContratoCount(usuarioId: string, ano?: number) {
    const idsIgnorar = await this.getPassageirosIdsComContratoValido(usuarioId, ano);

    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (ano !== undefined && ano !== null) {
      query = query.eq("ano_letivo", ano);
    }

    if (idsIgnorar.length > 0) {
      query = query.not("passageiro_id", "in", `(${idsIgnorar.join(",")})`);
    }

    const { count } = await query;
    return count || 0;
  },

  async insert(data: Record<string, unknown>) {
    const { data: result, error } = await supabaseAdmin
      .from("contratos")
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async updateStatus(id: string, data: Record<string, unknown>) {
    const { error } = await supabaseAdmin
      .from("contratos")
      .update(data)
      .eq("id", id);

    if (error) throw error;
    return true;
  },

  async aposentarContratosPassageiro(passageiroId: string, apenasPendentes = false, ano?: number) {
    const statusList = apenasPendentes
      ? [ContratoStatus.PENDENTE]
      : [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO];

    let query = supabaseAdmin
      .from("contratos")
      .update({ status: ContratoStatus.SUBSTITUIDO })
      .eq("passageiro_id", passageiroId)
      .in("status", statusList);

    if (ano !== undefined && ano !== null) {
      query = query.eq("ano", ano);
    }

    const { error } = await query;

    if (error) throw error;
    return true;
  },

  async delete(id: string, usuarioId: string) {
    const { error } = await supabaseAdmin
      .from("contratos")
      .delete()
      .eq("id", id)
      .eq("usuario_id", usuarioId);

    if (error) throw error;
    return true;
  },

  buildListContratosQuery(usuarioId: string, status?: ContratoStatus, ano?: number, activeIdsForYear?: string[] | null) {
    let query = supabaseAdmin
      .from("contratos")
      .select(
        `*, passageiro:passageiros!inner(${CONTRACT_PASSAGEIRO_SELECT})`
      )
      .eq("usuario_id", usuarioId);

    if (isValidFilterValue(status)) {
      query = query.eq("status", status);
    }
    if (ano !== undefined && ano !== null) {
      query = query.eq("ano", ano);
      if (activeIdsForYear && activeIdsForYear.length > 0) {
        query = query.in("passageiro_id", activeIdsForYear);
      }
    } else {
      query = query.eq("passageiros.ativo", true);
    }
    return query;
  },

  buildSemContratoQuery(usuarioId: string, idsIgnorar: string[], ano?: number) {
    let query = supabaseAdmin
      .from("passageiro_matriculas")
      .select(
        `
        id,
        passageiro_id,
        ano_letivo,
        ativo,
        valor_cobranca,
        dia_vencimento,
        periodo,
        isento,
        data_inicio_transporte,
        data_fim_transporte,
        passageiro:passageiros!inner(
          id,
          nome,
          responsaveis:passageiro_responsaveis(
            tipo, parentesco,
            responsavel:responsaveis(id, nome, cpf, email, telefone)
          )
        )
        `
      )
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (ano !== undefined && ano !== null) {
      query = query.eq("ano_letivo", ano);
    }

    if (idsIgnorar.length > 0) {
      query = query.not("passageiro_id", "in", `(${idsIgnorar.join(",")})`);
    }

    return query;
  },

  async listBasicByAno(usuarioId: string, ano: number, statuses?: string[]) {
    let query = supabaseAdmin
      .from("contratos")
      .select("id, passageiro_id, status, valor_parcela, valor_total, qtd_parcelas, dados_contrato")
      .eq("usuario_id", usuarioId)
      .eq("ano", ano);

    if (statuses && statuses.length > 0) {
      query = query.in("status", statuses as ContratoStatus[]);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async updateContratoReajuste(contratoId: string, updates: {
    valor_parcela: number;
    valor_total: number;
    dados_contrato: unknown;
  }) {
    const { error } = await supabaseAdmin
      .from("contratos")
      .update({
        valor_parcela: updates.valor_parcela,
        valor_total: updates.valor_total,
        dados_contrato: updates.dados_contrato as import("../types/database.types.js").Json,
      })
      .eq("id", contratoId);

    if (error) throw error;
  },
};

