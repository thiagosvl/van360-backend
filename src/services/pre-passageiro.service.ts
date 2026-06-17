import { moneyToNumber } from "../utils/currency.utils.js";
import { cleanString, onlyDigits } from "../utils/string.utils.js";
import { toPersistenceString } from "../utils/date.utils.js";
import { CreatePrePassageiroDTO } from "../types/dtos/pre-passageiro.dto.js";
import { prePassageiroRepository } from "../repositories/pre-passageiro.repository.js";

export const prePassageiroService = {
  async listPrePassageiros(usuarioId: string, search?: string) {
    return prePassageiroRepository.listPrePassageiros(usuarioId, search);
  },

  async createPrePassageiro(payload: CreatePrePassageiroDTO) {
    let valorCobranca = null;
    if (payload.valor_cobranca !== undefined && payload.valor_cobranca !== null && payload.valor_cobranca !== "") {
      valorCobranca = typeof payload.valor_cobranca === "string"
        ? moneyToNumber(payload.valor_cobranca)
        : Number(payload.valor_cobranca);

      if (isNaN(valorCobranca) || valorCobranca <= 0) {
        valorCobranca = null;
      }
    }

    let diaVencimento = null;
    if (payload.dia_vencimento !== undefined && payload.dia_vencimento !== null && payload.dia_vencimento !== "") {
      diaVencimento = Number(payload.dia_vencimento);
      if (isNaN(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
        diaVencimento = null;
      }
    }

    const prePassageiroData = {
      usuario_id: payload.usuario_id,
      nome: cleanString(payload.nome, true),
      nome_responsavel: cleanString(payload.nome_responsavel, true),

      cpf_responsavel: payload.cpf_responsavel ? onlyDigits(payload.cpf_responsavel) : null,
      telefone_responsavel: payload.telefone_responsavel ? onlyDigits(payload.telefone_responsavel) : null,
      escola_id: payload.escola_id || null,
      periodo: payload.periodo || null,
      valor_cobranca: valorCobranca,
      dia_vencimento: diaVencimento,
      logradouro: payload.logradouro || null,
      numero: payload.numero || null,
      bairro: payload.bairro || null,
      cidade: payload.cidade || null,
      estado: payload.estado || null,
      cep: payload.cep || null,
      referencia: payload.referencia || null,
      observacoes: payload.observacoes || null,
      modalidade: payload.modalidade || null,
      genero: payload.genero || null,
      parentesco_responsavel: payload.parentesco_responsavel || null,
      data_inicio_transporte: payload.data_inicio_transporte ? toPersistenceString(payload.data_inicio_transporte) : null,
      data_nascimento: payload.data_nascimento ? toPersistenceString(payload.data_nascimento) : null
    };

    return prePassageiroRepository.insert(prePassageiroData);
  },

  async deletePrePassageiro(prePassageiroId: string) {
    try {
      await prePassageiroRepository.delete(prePassageiroId);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Falha ao excluir o pré-cadastro: ${msg}`);
    }
  },
};
