import { describe, it, expect } from "vitest";
import { createPrePassageiroSchema, CreatePrePassageiroDTO } from "../src/types/dtos/pre-passageiro.dto.js";
import { PeriodoEnum, PassageiroGenero, PassageiroModalidade } from "../src/types/enums.js";
import { cleanString, onlyDigits } from "../src/utils/string.utils.js";
import { moneyToNumber } from "../src/utils/currency.utils.js";

function sanitizePrePassageiroData(payload: CreatePrePassageiroDTO) {
  let valorCobranca: number | null = null;
  if (payload.valor_cobranca !== undefined && payload.valor_cobranca !== null && payload.valor_cobranca !== "") {
    valorCobranca = typeof payload.valor_cobranca === "string"
      ? moneyToNumber(payload.valor_cobranca)
      : Number(payload.valor_cobranca);

    if (isNaN(valorCobranca) || valorCobranca <= 0) {
      valorCobranca = null;
    }
  }

  let diaVencimento: number | null = null;
  if (payload.dia_vencimento !== undefined && payload.dia_vencimento !== null && payload.dia_vencimento !== "") {
    diaVencimento = Number(payload.dia_vencimento);
    if (isNaN(diaVencimento) || diaVencimento < 1 || diaVencimento > 31) {
      diaVencimento = null;
    }
  }

  return {
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
    cep: payload.cep ? onlyDigits(payload.cep) : null,
    modalidade: payload.modalidade || null,
    genero: payload.genero || null,
    parentesco_responsavel: payload.parentesco_responsavel || null
  };
}

describe("Suíte de Testes - Pré-Cadastro Público de Passageiros (Formulário dos Pais)", () => {
  const validDriverUuid = "a1b2c3d4-e5f6-4a5b-8c9d-0123456789ab";

  describe("1. Validação de Schema Zod do Pré-Cadastro", () => {
    it("Deve aprovar payload público válido preenchido pelos pais", () => {
      const payload = {
        usuario_id: validDriverUuid,
        nome: "Enzo Gabriel Santos",
        nome_responsavel: "Juliana Santos",
        cpf_responsavel: "123.456.789-00",
        telefone_responsavel: "(11) 99887-6655",
        periodo: PeriodoEnum.MANHA,
        logradouro: "Rua das Flores",
        numero: "123",
        bairro: "Jardim América",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01234-567",
        modalidade: PassageiroModalidade.IDA_VOLTA,
        genero: PassageiroGenero.MASCULINO,
        parentesco_responsavel: "Mãe",
        valor_cobranca: "R$ 350,00",
        dia_vencimento: 10
      };

      const result = createPrePassageiroSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("Deve rejeitar quando o ID do motorista (usuario_id) não for um UUID válido", () => {
      const payload = {
        usuario_id: "id-invalido-123",
        nome: "Lucas Silva",
        nome_responsavel: "Marcos Silva"
      };

      const result = createPrePassageiroSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(i => i.path.includes("usuario_id"));
        expect(err?.message).toContain("ID do motorista inválido");
      }
    });

    it("Deve rejeitar se o nome do passageiro tiver menos de 2 caracteres", () => {
      const payload = {
        usuario_id: validDriverUuid,
        nome: "A",
        nome_responsavel: "Marcos Silva"
      };

      const result = createPrePassageiroSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const err = result.error.issues.find(i => i.path.includes("nome"));
        expect(err?.message).toContain("Nome do passageiro é obrigatório");
      }
    });

    it("Deve rejeitar se o nome do responsável for omitido", () => {
      const payload = {
        usuario_id: validDriverUuid,
        nome: "Lucas Silva",
        nome_responsavel: ""
      };

      const result = createPrePassageiroSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve rejeitar se a sigla do estado (UF) tiver tamanho diferente de 2 caracteres", () => {
      const payload = {
        usuario_id: validDriverUuid,
        nome: "Lucas Silva",
        nome_responsavel: "Marcos Silva",
        estado: "SAO PAULO"
      };

      const result = createPrePassageiroSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Sanitização e Normalização dos Dados do Pré-Cadastro", () => {
    it("Deve limpar espaços extras, extrair apenas dígitos do CPF, Telefone e CEP", () => {
      const payload: CreatePrePassageiroDTO = {
        usuario_id: validDriverUuid,
        nome: "   enzo   gabriel   santos   ",
        nome_responsavel: "   juliana   santos   ",
        cpf_responsavel: "123.456.789-00",
        telefone_responsavel: "(11) 99887-6655",
        cep: "01234-567",
        valor_cobranca: "R$ 450,50",
        dia_vencimento: "15"
      };

      const sanitized = sanitizePrePassageiroData(payload);

      expect(sanitized.nome).toBe("enzo gabriel santos");
      expect(sanitized.nome_responsavel).toBe("juliana santos");
      expect(sanitized.cpf_responsavel).toBe("12345678900");
      expect(sanitized.telefone_responsavel).toBe("11998876655");
      expect(sanitized.cep).toBe("01234567");
      expect(sanitized.valor_cobranca).toBe(450.5);
      expect(sanitized.dia_vencimento).toBe(15);
    });

    it("Deve converter valor_cobranca e dia_vencimento inválidos ou zerados para null", () => {
      const payload: CreatePrePassageiroDTO = {
        usuario_id: validDriverUuid,
        nome: "Beatriz Lima",
        nome_responsavel: "Carla Lima",
        valor_cobranca: "-50",
        dia_vencimento: 35
      };

      const sanitized = sanitizePrePassageiroData(payload);

      expect(sanitized.valor_cobranca).toBeNull();
      expect(sanitized.dia_vencimento).toBeNull();
    });
  });
});
