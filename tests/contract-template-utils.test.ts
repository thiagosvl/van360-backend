import { describe, it, expect } from "vitest";
import { cleanString, onlyDigits } from "../src/utils/string.utils.js";
import { moneyToNumber } from "../src/utils/currency.utils.js";
import { formatCurrency } from "../src/utils/format.js";
import { parseLocalDate, toPersistenceString, getNowBR } from "../src/utils/date.utils.js";
import { replaceContractTags, ContractTemplateData } from "../src/utils/contract-template.utils.js";
import {
  calculatePaginationParams,
  formatPaginatedMeta,
  sanitizeSqlSearch,
  buildSafeIlikeFilter,
} from "../src/utils/sql-pagination.utils.js";

describe("Suíte de Utilitários de Backend e Templates de Contrato", () => {
  describe("Substituição de Tags Dinâmicas no Modelo de Contrato", () => {
    it("Deve substituir todas as tags dinâmicas padrão corretamente no modelo", () => {
      const template = "Pelo presente instrumento, {{NOME_CONTRATANTE}}, inscrito sob CPF {{CPF_CONTRATANTE}}, contrata o serviço para o passageiro {{NOME_PASSAGEIRO}}, no valor mensal de {{VALOR_MENSAL}} com vencimento no dia {{VENCIMENTO}}. {{CIDADE_DATA}}.";

      const dados: ContractTemplateData = {
        nomeContratante: "João da Silva",
        cpfContratante: "12345678901",
        nomePassageiro: "Lucas Silva",
        valorMensal: 350.5,
        vencimento: 10,
        cidadeData: "São Paulo, 05 de Agosto de 2026",
      };

      const resultado = replaceContractTags(template, dados);

      expect(resultado).toContain("João da Silva");
      expect(resultado).toContain("123.456.789-01");
      expect(resultado).toContain("Lucas Silva");
      expect(resultado).toContain("R$");
      expect(resultado).toContain("350,50");
      expect(resultado).toContain("dia 10");
      expect(resultado).toContain("São Paulo, 05 de Agosto de 2026");
    });

    it("Deve substituir múltiplas ocorrências da mesma tag no modelo", () => {
      const template = "Contratante: {{NOME_CONTRATANTE}}. Assinatura do Contratante: {{NOME_CONTRATANTE}}.";
      const dados: ContractTemplateData = {
        nomeContratante: "Maria Oliveira",
      };

      const resultado = replaceContractTags(template, dados);

      expect(resultado).toBe("Contratante: Maria Oliveira. Assinatura do Contratante: Maria Oliveira.");
    });

    it("Deve substituir por string vazia quando os dados opcionais não forem fornecidos", () => {
      const template = "Contratante: {{NOME_CONTRATANTE}}, CPF: {{CPF_CONTRATANTE}}, Cidade: {{CIDADE_DATA}}.";
      const dados: ContractTemplateData = {};

      const resultado = replaceContractTags(template, dados);

      expect(resultado).toBe("Contratante: , CPF: , Cidade: .");
    });

    it("Deve retornar string vazia ao receber template vazio ou nulo", () => {
      const resultado = replaceContractTags("", { nomeContratante: "Teste" });
      expect(resultado).toBe("");
    });
  });

  describe("Utilitários de Tratamento de String", () => {
    describe("cleanString", () => {
      it("Deve remover espaços nas extremidades e colapsar múltiplos espaços internos", () => {
        const resultado = cleanString("   Carlos   Eduardo    Santos   ");
        expect(resultado).toBe("Carlos Eduardo Santos");
      });

      it("Deve retornar string vazia para entradas falsas ou vazias", () => {
        expect(cleanString("")).toBe("");
      });
    });

    describe("onlyDigits", () => {
      it("Deve extrair apenas os dígitos numéricos de strings formatadas", () => {
        expect(onlyDigits("123.456.789-01")).toBe("12345678901");
        expect(onlyDigits("(11) 98765-4321")).toBe("11987654321");
        expect(onlyDigits("ABC-1234")).toBe("1234");
      });

      it("Deve retornar string vazia para valores nulos, indefinios ou sem números", () => {
        expect(onlyDigits(null)).toBe("");
        expect(onlyDigits(undefined)).toBe("");
        expect(onlyDigits("sem digitos")).toBe("");
      });
    });
  });

  describe("Utilitários de Moeda", () => {
    describe("moneyToNumber", () => {
      it("Deve converter strings formatadas em moeda brasileira para number float", () => {
        expect(moneyToNumber("R$ 350,00")).toBe(350);
        expect(moneyToNumber("1.250,55")).toBe(1250.55);
        expect(moneyToNumber("R$ 0,50")).toBe(0.5);
      });

      it("Deve retornar o próprio número se já for um valor numérico", () => {
        expect(moneyToNumber(450.75)).toBe(450.75);
      });

      it("Deve retornar 0 para valores vazios ou inválidos", () => {
        expect(moneyToNumber("")).toBe(0);
        expect(moneyToNumber("texto")).toBe(0);
      });
    });

    describe("formatCurrency", () => {
      it("Deve formatar números para a representação em moeda BRL", () => {
        const formatado = formatCurrency(250.5);
        expect(formatado).toContain("250,50");
        expect(formatado).toContain("R$");
      });

      it("Deve formatar o valor 0 corretamente", () => {
        const formatado = formatCurrency(0);
        expect(formatado).toContain("0,00");
      });
    });
  });

  describe("Utilitários de Data", () => {
    describe("parseLocalDate", () => {
      it("Deve converter string no formato YYYY-MM-DD em objeto Date mantendo a data pretendida", () => {
        const data = parseLocalDate("2026-08-05");
        expect(data).toBeInstanceOf(Date);
        expect(data.getFullYear()).toBe(2026);
        expect(data.getMonth()).toBe(7);
        expect(data.getDate()).toBe(5);
      });

      it("Deve processar objetos Date já existentes", () => {
        const d = new Date(2026, 7, 5, 14, 30, 0);
        const parsed = parseLocalDate(d);
        expect(parsed).toBeInstanceOf(Date);
        expect(parsed.getFullYear()).toBe(2026);
      });

      it("Deve retornar data válida para strings ISO", () => {
        const parsed = parseLocalDate("2026-08-05T15:30:00.000Z");
        expect(parsed).toBeInstanceOf(Date);
        expect(isNaN(parsed.getTime())).toBe(false);
      });
    });

    describe("toPersistenceString", () => {
      it("Deve formatar objeto Date ou string de data para o padrão YYYY-MM-DD", () => {
        const d = new Date(2026, 7, 5);
        expect(toPersistenceString(d)).toBe("2026-08-05");
        expect(toPersistenceString("2026-08-05")).toBe("2026-08-05");
      });
    });

    describe("getNowBR", () => {
      it("Deve retornar um objeto Date válido representando o instante atual em Brasília", () => {
        const agora = getNowBR();
        expect(agora).toBeInstanceOf(Date);
        expect(isNaN(agora.getTime())).toBe(false);
      });
    });
  });

  describe("Utilitários de Paginação e Consulta SQL Segura", () => {
    describe("calculatePaginationParams", () => {
      it("Deve calcular parâmetros de paginação padrão (página 1, limite 20)", () => {
        const params = calculatePaginationParams();
        expect(params).toEqual({
          page: 1,
          limit: 20,
          from: 0,
          to: 19,
          offset: 0,
        });
      });

      it("Deve calcular intervalos from/to e offset para páginas subsequentes", () => {
        const params = calculatePaginationParams({ page: 3, limit: 15 });
        expect(params).toEqual({
          page: 3,
          limit: 15,
          from: 30,
          to: 44,
          offset: 30,
        });
      });

      it("Deve tratar strings numéricas e limitar ao limite máximo especificado", () => {
        const params = calculatePaginationParams({ page: "2", limit: "150", maxLimit: 100 });
        expect(params.page).toBe(2);
        expect(params.limit).toBe(100);
        expect(params.from).toBe(100);
        expect(params.to).toBe(199);
      });

      it("Deve corrigir páginas e limites inválidos ou menores que 1", () => {
        const params = calculatePaginationParams({ page: -5, limit: 0 });
        expect(params.page).toBe(1);
        expect(params.limit).toBe(20);
      });
    });

    describe("formatPaginatedMeta", () => {
      it("Deve calcular corretamente totalPages com base no total e limite por página", () => {
        const meta = formatPaginatedMeta(45, 1, 10);
        expect(meta).toEqual({
          page: 1,
          limit: 10,
          total: 45,
          totalPages: 5,
        });
      });

      it("Deve retornar totalPages 0 quando o total for 0", () => {
        const meta = formatPaginatedMeta(0, 1, 20);
        expect(meta.totalPages).toBe(0);
      });
    });

    describe("sanitizeSqlSearch e buildSafeIlikeFilter", () => {
      it("Deve escapar caracteres curinga e perigosos de busca SQL (% _ ' \\)", () => {
        const buscaPerigosa = "100%_desconto' OR '1'='1\\";
        const sanitizada = sanitizeSqlSearch(buscaPerigosa);
        expect(sanitizada).toBe("100\\%\\_desconto'' OR ''1''=''1\\\\");
      });

      it("Deve retornar string vazia ao sanitizar buscas nulas ou indefinias", () => {
        expect(sanitizeSqlSearch(null)).toBe("");
        expect(sanitizeSqlSearch(undefined)).toBe("");
      });

      it("Deve construir o filtro ilike seguro para colunas", () => {
        const filtro = buildSafeIlikeFilter("nome", "João % Silva");
        expect(filtro).toBe("nome.ilike.%João \\% Silva%");
      });
    });
  });
});
