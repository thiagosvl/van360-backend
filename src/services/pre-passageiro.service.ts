import { supabaseAdmin } from "../config/supabase";
import { cleanString, onlyDigits } from "../utils/utils";

export const prePassageiroService = {
  async listPrePassageiros(usuarioId: string, search?: string) {
    let query = supabaseAdmin
      .from("pre_passageiros")
      .select("*")
      .eq("usuario_id", usuarioId)
      .order("nome");

    if (search?.trim().length) {
      query = query.or(
        `nome.ilike.%${search}%,nome_responsavel.ilike.%${search}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  },

  async createPrePassageiro(payload: {
    usuario_id: string;
    nome: string;
    nome_responsavel: string;
    email_responsavel: string;
    cpf_responsavel: string;
    telefone_responsavel: string;
  }) {
    const prePassageiroData = {
      ...payload,
      nome: cleanString(payload.nome, true),
      nome_responsavel: cleanString(payload.nome_responsavel, true),
      email_responsavel: cleanString(payload.email_responsavel),
      cpf_responsavel: onlyDigits(payload.cpf_responsavel),
      telefone_responsavel: onlyDigits(payload.telefone_responsavel),
      escola_id: null,
      valor_cobranca: null,
      dia_vencimento: null,
    };

    const { data, error } = await supabaseAdmin
      .from("pre_passageiros")
      .insert([prePassageiroData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePrePassageiro(prePassageiroId: string) {
    const { error } = await supabaseAdmin
      .from("pre_passageiros")
      .delete()
      .eq("id", prePassageiroId);

    if (error) throw new Error("Falha ao excluir o pré-cadastro.");
    return true;
  },
};
