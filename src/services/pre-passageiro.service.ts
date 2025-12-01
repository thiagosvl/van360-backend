import { supabaseAdmin } from "../config/supabase.js";
import { cleanString, moneyToNumber, onlyDigits } from "../utils/utils.js";

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

  async createPrePassageiro(payload: any) {
    // Processa valor_cobranca: converte string para number se necessário (mesma lógica do serviço de passageiros)
    let valorCobranca = null;
    if (payload.valor_cobranca !== undefined && payload.valor_cobranca !== null && payload.valor_cobranca !== "") {
      valorCobranca = typeof payload.valor_cobranca === "string" 
        ? moneyToNumber(payload.valor_cobranca)
        : Number(payload.valor_cobranca);
      
      // Valida se é um número válido e maior que zero
      if (isNaN(valorCobranca) || valorCobranca <= 0) {
        valorCobranca = null;
      }
    }

    // Processa dia_vencimento: valida se está entre 1 e 31
    let diaVencimento = null;
    if (payload.dia_vencimento !== undefined && payload.dia_vencimento !== null && payload.dia_vencimento !== "") {
      diaVencimento = Number(payload.dia_vencimento);
      // Valida se é um número válido entre 1 e 31
      if (isNaN(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
        diaVencimento = null;
      }
    }

    const prePassageiroData = {
      ...payload,
      nome: cleanString(payload.nome, true),
      nome_responsavel: cleanString(payload.nome_responsavel, true),
      email_responsavel: cleanString(payload.email_responsavel),
      cpf_responsavel: onlyDigits(payload.cpf_responsavel),
      telefone_responsavel: onlyDigits(payload.telefone_responsavel),
      escola_id: payload.escola_id || null,
      periodo: payload.periodo || null,
      valor_cobranca: valorCobranca,
      dia_vencimento: diaVencimento,
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
