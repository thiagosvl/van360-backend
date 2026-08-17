import { supabaseAdmin } from "../config/supabase.js";
import { ContratoStatus } from "../types/enums.js";
import { isValidFilterValue } from "../utils/filter.utils.js";

const CONTRACT_PASSAGEIRO_SELECT = `
  id, nome, ativo, valor_cobranca, dia_vencimento,
  responsaveis:passageiro_responsaveis(
    tipo, parentesco,
    responsavel:responsaveis(id, nome, cpf, email, telefone)
  )
`;

export const contractRepository = {
  async getByToken(tokenAcesso: string) {
    const { data, error } = await supabaseAdmin
      .from("contratos")
      .select(`*, usuario:usuarios(*), passageiro:passageiros(${CONTRACT_PASSAGEIRO_SELECT})`)
      .eq("token_acesso", tokenAcesso)
      .single();

    if (error) throw error;
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

  async getFinalUrl(id: string) {
    return supabaseAdmin
      .from("contratos")
      .select("contrato_final_url")
      .eq("id", id)
      .single();
  },

  async getPassageirosIdsComContratoValido(usuarioId: string) {
    const { data } = await supabaseAdmin
      .from("contratos")
      .select("passageiro_id, passageiros!inner(ativo)")
      .eq("usuario_id", usuarioId)
      .eq("passageiros.ativo", true)
      .in("status", [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO]);

    return data?.map((c) => c.passageiro_id) || [];
  },

  async getKPIs(usuarioId: string) {
    const { count: pendentes } = await supabaseAdmin
      .from("contratos")
      .select("id, passageiros!inner(ativo)", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("status", ContratoStatus.PENDENTE)
      .eq("passageiros.ativo", true);

    const { count: assinados } = await supabaseAdmin
      .from("contratos")
      .select("id, passageiros!inner(ativo)", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("status", ContratoStatus.ASSINADO)
      .eq("passageiros.ativo", true);

    return { pendentes: pendentes || 0, assinados: assinados || 0 };
  },

  async getSemContratoCount(usuarioId: string) {
    const idsIgnorar = await this.getPassageirosIdsComContratoValido(usuarioId);

    let query = supabaseAdmin
      .from("passageiros")
      .select("id", { count: "exact", head: true })
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (idsIgnorar.length > 0) {
      query = query.not("id", "in", `(${idsIgnorar.join(",")})`);
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

  async aposentarContratosPassageiro(passageiroId: string, apenasPendentes = false) {
    const statusList = apenasPendentes
      ? [ContratoStatus.PENDENTE]
      : [ContratoStatus.PENDENTE, ContratoStatus.ASSINADO];

    const { error } = await supabaseAdmin
      .from("contratos")
      .update({ status: ContratoStatus.SUBSTITUIDO })
      .eq("passageiro_id", passageiroId)
      .in("status", statusList);

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

  buildListContratosQuery(usuarioId: string, status?: ContratoStatus) {
    let query = supabaseAdmin
      .from("contratos")
      .select(
        `*, passageiro:passageiros!inner(${CONTRACT_PASSAGEIRO_SELECT})`,
        { count: "exact" }
      )
      .eq("usuario_id", usuarioId)
      .eq("passageiros.ativo", true)
      .order("created_at", { ascending: false });

    if (isValidFilterValue(status)) {
      query = query.eq("status", status);
    }
    return query;
  },

  buildSemContratoQuery(usuarioId: string, idsIgnorar: string[]) {
    let query = supabaseAdmin
      .from("passageiros")
      .select(
        CONTRACT_PASSAGEIRO_SELECT,
        { count: "exact" }
      )
      .eq("usuario_id", usuarioId)
      .eq("ativo", true);

    if (idsIgnorar.length > 0) {
      query = query.not("id", "in", `(${idsIgnorar.join(",")})`);
    }

    return query;
  },
};

