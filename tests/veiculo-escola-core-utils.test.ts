import { describe, it, expect, vi, beforeEach } from "vitest";
import { veiculoService } from "../src/services/veiculo.service.js";
import { escolaService } from "../src/services/escola.service.js";
import { veiculoRepository } from "../src/repositories/veiculo.repository.js";
import { escolaRepository } from "../src/repositories/escola.repository.js";
import { AppError } from "../src/errors/AppError.js";
import { maskPhone, formatCurrency, capitalize, getFirstName, getFirstAndSecondName } from "../src/utils/format.js";
import { moneyToNumber } from "../src/utils/currency.utils.js";
import { cleanString, onlyDigits, formatEvolutionNumber } from "../src/utils/string.utils.js";
import { limparPlaca } from "../src/utils/placa.utils.js";
import {
  parseLocalDate,
  toPersistenceString,
  getStartOfDayBR,
  getEndOfDayBR,
  diffInDays,
  parseBrazilianDateToISO,
  formatToBrazilianDate,
} from "../src/utils/date.utils.js";
import { PeriodoEnum } from "../src/types/enums.js";

vi.mock("../src/repositories/veiculo.repository.js", () => ({
  veiculoRepository: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    listComContagemAtivos: vi.fn(),
    updateAtivo: vi.fn(),
    getUsuarioIdAndPlaca: vi.fn(),
    countByUsuario: vi.fn(),
  },
}));

vi.mock("../src/repositories/escola.repository.js", () => ({
  escolaRepository: {
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    list: vi.fn(),
    listComContagemAtivos: vi.fn(),
    updateAtivo: vi.fn(),
    getUsuarioIdAndNome: vi.fn(),
    countByUsuario: vi.fn(),
  },
}));

vi.mock("../src/repositories/historico.repository.js", () => ({
  historicoRepository: {
    insert: vi.fn().mockResolvedValue({ data: {}, error: null }),
    insertBulk: vi.fn().mockResolvedValue({ data: [], error: null }),
    listByEntidade: vi.fn().mockResolvedValue({ data: [], error: null }),
    listByUsuario: vi.fn().mockResolvedValue({ data: [], error: null }),
  },
}));

interface EscolaComTurno {
  id: string;
  nome: string;
  turno: PeriodoEnum;
}

interface PassageiroEscolar {
  id: string;
  nome: string;
  escola_id: string;
  turno: PeriodoEnum;
}

const TURNO_PRIORIDADE: Record<PeriodoEnum, number> = {
  [PeriodoEnum.MANHA]: 1,
  [PeriodoEnum.TARDE]: 2,
  [PeriodoEnum.NOITE]: 3,
  [PeriodoEnum.INTEGRAL]: 4,
};

function ordenarEscolasPorTurno(escolas: EscolaComTurno[]): EscolaComTurno[] {
  return [...escolas].sort((a, b) => {
    const pA = TURNO_PRIORIDADE[a.turno] ?? 99;
    const pB = TURNO_PRIORIDADE[b.turno] ?? 99;
    if (pA !== pB) return pA - pB;
    return a.nome.localeCompare(b.nome);
  });
}

function vincularPassageiroEscola(
  passageiroId: string,
  nomePassageiro: string,
  escolaId: string,
  turno: PeriodoEnum
): PassageiroEscolar {
  if (!passageiroId || !escolaId) {
    throw new AppError("ID do passageiro e da escola são obrigatórios", 400);
  }
  return {
    id: passageiroId,
    nome: nomePassageiro,
    escola_id: escolaId,
    turno,
  };
}

function extrairDddTelefone(telefone: string | null | undefined): string {
  const digitos = onlyDigits(telefone);
  if (digitos.length < 10) return "";
  return digitos.substring(0, 2);
}

function mascararTelefoneCorporativo(telefone: string | null | undefined): string {
  if (!telefone) return "";
  const digitos = onlyDigits(telefone);
  if (digitos.length < 10) return telefone;
  const ddd = digitos.substring(0, 2);
  const sufixo = digitos.substring(digitos.length - 4);
  return `(${ddd}) *****-${sufixo}`;
}

describe("Suíte de Testes Unificados: Veículos, Escolas e Utilitários do Backend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Gerenciamento e Regras do veiculo.service.ts", () => {
    it("Deve lançar erro ao tentar criar veículo sem usuario_id", async () => {
      await expect(
        veiculoService.createVeiculo({ usuario_id: "", placa: "ABC-1234" })
      ).rejects.toThrow("Usuário obrigatório");
    });

    it("Deve lançar erro ao tentar criar veículo sem placa", async () => {
      await expect(
        veiculoService.createVeiculo({ usuario_id: "usr-1", placa: "" })
      ).rejects.toThrow("Placa é obrigatória");
    });

    it("Deve criar um veículo com sucesso e sanitizar a placa", async () => {
      const mockResult = {
        id: "v1",
        usuario_id: "usr-1",
        placa: "ABC1D23",
        marca: "Mercedes",
        modelo: "Sprinter",
        ativo: true,
      };

      vi.mocked(veiculoRepository.insert).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const res = await veiculoService.createVeiculo({
        usuario_id: "usr-1",
        placa: "abc-1d23",
        marca: " Mercedes ",
        modelo: " Sprinter ",
      });

      expect(veiculoRepository.insert).toHaveBeenCalledWith({
        usuario_id: "usr-1",
        placa: "ABC1D23",
        marca: "Mercedes",
        modelo: "Sprinter",
        ativo: true,
      });
      expect(res).toEqual(mockResult);
    });

    it("Deve atualizar um veículo existente e formatar a placa", async () => {
      const mockResult = {
        id: "v1",
        usuario_id: "usr-1",
        placa: "XYZ9876",
        marca: "Renault",
        modelo: "Master",
        ativo: true,
      };

      vi.mocked(veiculoRepository.update).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const res = await veiculoService.updateVeiculo("v1", {
        placa: "xyz-9876",
      });

      expect(veiculoRepository.update).toHaveBeenCalledWith("v1", {
        placa: "XYZ9876",
      });
      expect(res.placa).toBe("XYZ9876");
    });

    it("Deve lançar erro ao atualizar sem informar o ID do veículo", async () => {
      await expect(
        veiculoService.updateVeiculo("", { placa: "ABC1234" })
      ).rejects.toThrow("ID do veículo é obrigatório");
    });

    it("Deve inativar e reativar um veículo via toggleAtivo", async () => {
      vi.mocked(veiculoRepository.updateAtivo).mockResolvedValueOnce({
        error: null,
      });
      vi.mocked(veiculoRepository.getUsuarioIdAndPlaca).mockResolvedValueOnce({
        data: { usuario_id: "usr-1", placa: "ABC1234" },
        error: null,
      });

      const statusDesativado = await veiculoService.toggleAtivo("v1", false);
      expect(statusDesativado).toBe(false);
      expect(veiculoRepository.updateAtivo).toHaveBeenCalledWith("v1", false);

      vi.mocked(veiculoRepository.updateAtivo).mockResolvedValueOnce({
        error: null,
      });
      vi.mocked(veiculoRepository.getUsuarioIdAndPlaca).mockResolvedValueOnce({
        data: { usuario_id: "usr-1", placa: "ABC1234" },
        error: null,
      });

      const statusAtivado = await veiculoService.toggleAtivo("v1", true);
      expect(statusAtivado).toBe(true);
      expect(veiculoRepository.updateAtivo).toHaveBeenCalledWith("v1", true);
    });
  });

  describe("2. Gerenciamento e Regras do escola.service.ts", () => {
    it("Deve lançar erro ao tentar criar escola sem usuario_id", async () => {
      await expect(
        escolaService.createEscola({ usuario_id: "", nome: "Escola Modelo" })
      ).rejects.toThrow("Usuário obrigatório");
    });

    it("Deve lançar erro ao tentar criar escola sem nome", async () => {
      await expect(
        escolaService.createEscola({ usuario_id: "usr-1", nome: "" })
      ).rejects.toThrow("Nome da escola é obrigatório");
    });

    it("Deve cadastrar uma escola sanitizando e capitalizando o nome e endereço", async () => {
      const mockResult = {
        id: "esc-1",
        usuario_id: "usr-1",
        nome: "Escola Monteiro Lobato",
        logradouro: "Rua Das Flores",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        ativo: true,
      };

      vi.mocked(escolaRepository.insert).mockResolvedValueOnce({
        data: mockResult,
        error: null,
      });

      const res = await escolaService.createEscola({
        usuario_id: "usr-1",
        nome: "  Escola Monteiro Lobato  ",
        logradouro: "  Rua Das Flores  ",
        bairro: "  Centro  ",
        cidade: "  São Paulo  ",
        estado: "  SP  ",
      });

      expect(escolaRepository.insert).toHaveBeenCalledWith({
        usuario_id: "usr-1",
        nome: "Escola Monteiro Lobato",
        logradouro: "Rua Das Flores",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        ativo: true,
      });
      expect(res.nome).toBe("Escola Monteiro Lobato");
    });

    it("Deve ordenar escolas corretamente por hierarquia de turno", () => {
      const listaEscolas: EscolaComTurno[] = [
        { id: "e1", nome: "Escola C", turno: PeriodoEnum.NOITE },
        { id: "e2", nome: "Escola A", turno: PeriodoEnum.MANHA },
        { id: "e3", nome: "Escola D", turno: PeriodoEnum.INTEGRAL },
        { id: "e4", nome: "Escola B", turno: PeriodoEnum.TARDE },
      ];

      const ordenadas = ordenarEscolasPorTurno(listaEscolas);

      expect(ordenadas.map((e) => e.turno)).toEqual([
        PeriodoEnum.MANHA,
        PeriodoEnum.TARDE,
        PeriodoEnum.NOITE,
        PeriodoEnum.INTEGRAL,
      ]);
    });

    it("Deve associar passageiro à escola e turno com sucesso", () => {
      const vinculo = vincularPassageiroEscola("p1", "Gabriel Souza", "esc-10", PeriodoEnum.MANHA);

      expect(vinculo).toEqual({
        id: "p1",
        nome: "Gabriel Souza",
        escola_id: "esc-10",
        turno: PeriodoEnum.MANHA,
      });
    });

    it("Deve lançar erro ao tentar vincular passageiro sem ID da escola ou do passageiro", () => {
      expect(() =>
        vincularPassageiroEscola("", "Gabriel", "esc-10", PeriodoEnum.MANHA)
      ).toThrow("ID do passageiro e da escola são obrigatórios");
    });

    it("Deve inativar e ativar uma escola via toggleAtivo", async () => {
      vi.mocked(escolaRepository.updateAtivo).mockResolvedValueOnce({
        error: null,
      });
      vi.mocked(escolaRepository.getUsuarioIdAndNome).mockResolvedValueOnce({
        data: { usuario_id: "usr-1", nome: "Escola Dom Pedro" },
        error: null,
      });

      const inativado = await escolaService.toggleAtivo("esc-1", false);
      expect(inativado).toBe(false);

      vi.mocked(escolaRepository.updateAtivo).mockResolvedValueOnce({
        error: null,
      });
      vi.mocked(escolaRepository.getUsuarioIdAndNome).mockResolvedValueOnce({
        data: { usuario_id: "usr-1", nome: "Escola Dom Pedro" },
        error: null,
      });

      const ativado = await escolaService.toggleAtivo("esc-1", true);
      expect(ativado).toBe(true);
    });
  });

  describe("3. Utilitários de Domínio (Telefone, Moeda, Data, String e Placa)", () => {
    describe("Telefone e DDD", () => {
      it("Deve formatar telefone celular de 11 dígitos", () => {
        expect(maskPhone("11987654321")).toBe("(11) 98765-4321");
      });

      it("Deve formatar telefone fixo de 10 dígitos", () => {
        expect(maskPhone("1134567890")).toBe("(11) 3456-7890");
      });

      it("Deve formatar número para padrão telefone com DDI 55", () => {
        expect(formatEvolutionNumber("11987654321")).toBe("5511987654321");
        expect(formatEvolutionNumber("5511987654321")).toBe("5511987654321");
      });

      it("Deve extrair DDD de uma string de telefone", () => {
        expect(extrairDddTelefone("(11) 98765-4321")).toBe("11");
        expect(extrairDddTelefone("21999998888")).toBe("21");
        expect(extrairDddTelefone("123")).toBe("");
      });

      it("Deve aplicar mascaramento corporativo de telefone mantendo apenas DDD e 4 dígitos finais", () => {
        expect(mascararTelefoneCorporativo("11987654321")).toBe("(11) *****-4321");
        expect(mascararTelefoneCorporativo(null)).toBe("");
      });
    });

    describe("Moeda e Valores Numéricos", () => {
      it("Deve converter string formatada em R$ para número decimal float", () => {
        expect(moneyToNumber("R$ 1.500,50")).toBe(1500.5);
        expect(moneyToNumber("R$ 0,00")).toBe(0);
        expect(moneyToNumber("250,75")).toBe(250.75);
        expect(moneyToNumber(100)).toBe(100);
        expect(moneyToNumber("")).toBe(0);
      });

      it("Deve formatar número para moeda brasileira BRL", () => {
        const formatado = formatCurrency(1250.5);
        expect(formatado).toContain("1.250,50");
      });
    });

    describe("Data e Fusos Horários", () => {
      it("Deve parsear data YYYY-MM-DD fixando meio-dia no fuso de Brasília", () => {
        const d = parseLocalDate("2026-08-10");
        expect(d.getFullYear()).toBe(2026);
        expect(d.getMonth()).toBe(7);
        expect(d.getDate()).toBe(10);
      });

      it("Deve converter Date para string de persistência YYYY-MM-DD", () => {
        const d = parseLocalDate("2026-12-25");
        expect(toPersistenceString(d)).toBe("2026-12-25");
      });

      it("Deve calcular diferença exata de dias entre duas datas", () => {
        const d1 = "2026-08-01";
        const d2 = "2026-08-10";
        expect(diffInDays(d1, d2)).toBe(9);
      });

      it("Deve converter data brasileira DD/MM/YYYY para formato ISO YYYY-MM-DD", () => {
        expect(parseBrazilianDateToISO("25/12/2026")).toBe("2026-12-25");
        expect(parseBrazilianDateToISO("25122026")).toBe("2026-12-25");
        expect(parseBrazilianDateToISO("2026-12-25")).toBe("2026-12-25");
        expect(parseBrazilianDateToISO(null)).toBeNull();
      });

      it("Deve formatar Date ou string para padrão brasileiro DD/MM/YYYY", () => {
        expect(formatToBrazilianDate("2026-08-05")).toBe("05/08/2026");
      });
    });

    describe("Strings e Placas de Veículos", () => {
      it("Deve limpar espaços e caracteres de placa deixando em maiúsculas", () => {
        expect(limparPlaca(" abc-1d23 ")).toBe("ABC1D23");
        expect(limparPlaca("xyz 9876")).toBe("XYZ9876");
      });

      it("Deve sanitizar strings removendo espaços duplicados", () => {
        expect(cleanString("  Maria   da   Silva  ")).toBe("Maria da Silva");
      });

      it("Deve capitalizar palavras respeitando preposições em minúsculo", () => {
        expect(capitalize("MARIA DA SILVA E SOUZA")).toBe("Maria da Silva e Souza");
      });

      it("Deve extrair primeiro nome e dois primeiros nomes", () => {
        expect(getFirstName("Lucas Almeida Prado")).toBe("Lucas");
        expect(getFirstAndSecondName("Lucas Almeida Prado")).toBe("Lucas Almeida");
        expect(getFirstName("")).toBe("");
      });
    });
  });
});
