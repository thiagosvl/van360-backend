import { describe, it, expect } from "vitest";
import { ContratoStatus } from "../src/types/enums.js";

interface DadosContratoInput {
  nomePassageiro: string;
  nomeResponsavel: string;
  cpfResponsavel: string;
  dataInicio: string;
  dataFim: string;
  valorMensal: number;
  qtdParcelas: number;
}

interface ResultadoValidacaoContrato {
  valido: boolean;
  erros: string[];
  valorTotal?: number;
}

function validarCPF(cpf: string): boolean {
  const limpo = cpf.replace(/\D/g, "");
  return limpo.length === 11 && !/^(\d)\1{10}$/.test(limpo);
}

function validarDadosContrato(dados: Partial<DadosContratoInput>): ResultadoValidacaoContrato {
  const erros: string[] = [];

  if (!dados.nomeResponsavel || dados.nomeResponsavel.trim().length === 0) {
    erros.push("Nome do responsável é obrigatório.");
  } else {
    const nomeNorm = dados.nomeResponsavel.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nomeNorm.includes("responsavel nao info") || nomeNorm.includes("responsavel teste")) {
      erros.push("Nome do responsável inválido ou temporário.");
    }
  }

  if (!dados.cpfResponsavel || !validarCPF(dados.cpfResponsavel)) {
    erros.push("CPF do responsável é obrigatório e deve ter 11 dígitos válidos.");
  }

  if (!dados.nomePassageiro || dados.nomePassageiro.trim().length === 0) {
    erros.push("Nome do passageiro é obrigatório.");
  }

  if (!dados.dataInicio) {
    erros.push("Data de início de transporte é obrigatória.");
  }

  if (!dados.dataFim) {
    erros.push("Data de término de transporte é obrigatória.");
  }

  if (dados.dataInicio && dados.dataFim) {
    const dInicio = new Date(dados.dataInicio);
    const dFim = new Date(dados.dataFim);
    if (dFim < dInicio) {
      erros.push("Data de término do transporte não pode ser anterior à data de início.");
    }
  }

  if (dados.valorMensal === undefined || dados.valorMensal <= 0) {
    erros.push("Valor mensal deve ser maior que zero.");
  }

  if (dados.qtdParcelas === undefined || dados.qtdParcelas <= 0) {
    erros.push("Quantidade de parcelas deve ser maior que zero.");
  }

  const valido = erros.length === 0;
  const valorTotal = valido ? (dados.valorMensal || 0) * (dados.qtdParcelas || 0) : undefined;

  return { valido, erros, valorTotal };
}

const TRANSICOES_CONTRATO: Record<ContratoStatus, ContratoStatus[]> = {
  [ContratoStatus.RASCUNHO]: [ContratoStatus.PENDENTE],
  [ContratoStatus.PENDENTE]: [ContratoStatus.ASSINADO, ContratoStatus.SUBSTITUIDO],
  [ContratoStatus.ASSINADO]: [ContratoStatus.SUBSTITUIDO],
  [ContratoStatus.SUBSTITUIDO]: [],
};

function transitarStatusContrato(statusAtual: ContratoStatus, novoStatus: ContratoStatus): ContratoStatus {
  if (statusAtual === novoStatus) return statusAtual;
  const permitidos = TRANSICOES_CONTRATO[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    throw new Error(`Transição de status de contrato inválida: de '${statusAtual}' para '${novoStatus}'.`);
  }
  return novoStatus;
}

describe("Suíte de Testes de Contratos e Assinatura Eletrônica", () => {
  describe("Validação de Dados Contratuais", () => {
    it("Deve validar dados contratuais válidos e calcular o valor total", () => {
      const payload: DadosContratoInput = {
        nomePassageiro: "Lucas Silva",
        nomeResponsavel: "Carlos Silva",
        cpfResponsavel: "123.456.789-01",
        dataInicio: "2026-01-01",
        dataFim: "2026-12-31",
        valorMensal: 350,
        qtdParcelas: 12,
      };

      const res = validarDadosContrato(payload);
      expect(res.valido).toBe(true);
      expect(res.erros).toHaveLength(0);
      expect(res.valorTotal).toBe(4200);
    });

    it("Deve rejeitar contrato se o CPF do responsável for inválido", () => {
      const payload: DadosContratoInput = {
        nomePassageiro: "Lucas Silva",
        nomeResponsavel: "Carlos Silva",
        cpfResponsavel: "111.111.111-11",
        dataInicio: "2026-01-01",
        dataFim: "2026-12-31",
        valorMensal: 350,
        qtdParcelas: 12,
      };

      const res = validarDadosContrato(payload);
      expect(res.valido).toBe(false);
      expect(res.erros).toContain("CPF do responsável é obrigatório e deve ter 11 dígitos válidos.");
    });

    it("Deve rejeitar contrato se o nome do responsável for genérico ou temporário", () => {
      const payload: DadosContratoInput = {
        nomePassageiro: "Lucas Silva",
        nomeResponsavel: "Responsavel Nao Informado",
        cpfResponsavel: "123.456.789-01",
        dataInicio: "2026-01-01",
        dataFim: "2026-12-31",
        valorMensal: 350,
        qtdParcelas: 12,
      };

      const res = validarDadosContrato(payload);
      expect(res.valido).toBe(false);
      expect(res.erros).toContain("Nome do responsável inválido ou temporário.");
    });

    it("Deve rejeitar se a data de término for anterior à data de início", () => {
      const payload: DadosContratoInput = {
        nomePassageiro: "Lucas Silva",
        nomeResponsavel: "Carlos Silva",
        cpfResponsavel: "123.456.789-01",
        dataInicio: "2026-12-31",
        dataFim: "2026-01-01",
        valorMensal: 350,
        qtdParcelas: 12,
      };

      const res = validarDadosContrato(payload);
      expect(res.valido).toBe(false);
      expect(res.erros).toContain("Data de término do transporte não pode ser anterior à data de início.");
    });
  });

  describe("Ciclo de Status de Assinatura Eletrônica ('rascunho' -> 'pendente' -> 'assinado')", () => {
    it("Deve permitir a transição completa de status de 'rascunho' para 'pendente' e para 'assinado'", () => {
      let status = ContratoStatus.RASCUNHO;

      status = transitarStatusContrato(status, ContratoStatus.PENDENTE);
      expect(status).toBe(ContratoStatus.PENDENTE);

      status = transitarStatusContrato(status, ContratoStatus.ASSINADO);
      expect(status).toBe(ContratoStatus.ASSINADO);
    });

    it("Deve proibir transição direta de 'rascunho' para 'assinado'", () => {
      expect(() => transitarStatusContrato(ContratoStatus.RASCUNHO, ContratoStatus.ASSINADO)).toThrow(
        "Transição de status de contrato inválida: de 'rascunho' para 'assinado'."
      );
    });

    it("Deve proibir transição de 'assinado' de volta para 'rascunho' ou 'pendente'", () => {
      expect(() => transitarStatusContrato(ContratoStatus.ASSINADO, ContratoStatus.RASCUNHO)).toThrow(
        "Transição de status de contrato inválida: de 'assinado' para 'rascunho'."
      );
      expect(() => transitarStatusContrato(ContratoStatus.ASSINADO, ContratoStatus.PENDENTE)).toThrow(
        "Transição de status de contrato inválida: de 'assinado' para 'pendente'."
      );
    });
  });
});
