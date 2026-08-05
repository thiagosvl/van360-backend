import { describe, it, expect } from "vitest";
import { PeriodoEnum } from "../src/types/enums.js";

interface PassageiroInput {
  id: string;
  nome: string;
  data_nascimento?: string | null;
  escola_id?: string | null;
  periodo?: string | null;
}

interface ResultadoAniversariantes {
  aniversariantes: { id: string; nome: string; dia: number; mes: number }[];
  passageirosSemData: number;
}

function filtrarAniversariantesDoMes(passageiros: PassageiroInput[], mesTarget: number): ResultadoAniversariantes {
  let passageirosSemData = 0;
  const aniversariantes: { id: string; nome: string; dia: number; mes: number }[] = [];

  for (const p of passageiros) {
    if (!p.data_nascimento) {
      passageirosSemData++;
      continue;
    }

    const date = new Date(p.data_nascimento);
    if (isNaN(date.getTime())) {
      passageirosSemData++;
      continue;
    }

    const mes = date.getUTCMonth() + 1;
    const dia = date.getUTCDate();

    if (mes === mesTarget) {
      aniversariantes.push({
        id: p.id,
        nome: p.nome,
        dia,
        mes,
      });
    }
  }

  aniversariantes.sort((a, b) => a.dia - b.dia);

  return { aniversariantes, passageirosSemData };
}

const TURNOS_PERMITIDOS = [PeriodoEnum.MANHA, PeriodoEnum.TARDE, PeriodoEnum.INTEGRAL, PeriodoEnum.NOITE];

interface VinculoEscolar {
  passageiro_id: string;
  escola_id: string;
  periodo: PeriodoEnum;
}

function vincularPassageiroTurnoEscolar(
  passageiroId: string,
  escolaId: string,
  periodoInput: string
): VinculoEscolar {
  if (!passageiroId || !escolaId) {
    throw new Error("ID do passageiro e da escola são obrigatórios.");
  }

  const periodoNormalizado = periodoInput.trim().toLowerCase();
  if (!TURNOS_PERMITIDOS.includes(periodoNormalizado as PeriodoEnum)) {
    throw new Error(`Turno escolar '${periodoInput}' é inválido. Turnos aceitos: 'manha', 'tarde', 'integral', 'noite'.`);
  }

  return {
    passageiro_id: passageiroId,
    escola_id: escolaId,
    periodo: periodoNormalizado as PeriodoEnum,
  };
}

function filtrarPassageirosPorTurno(passageiros: PassageiroInput[], escolaId: string, periodo: PeriodoEnum): PassageiroInput[] {
  return passageiros.filter((p) => p.escola_id === escolaId && p.periodo === periodo);
}

describe("Suíte de Testes de Escolas, Aniversários e Turnos Escolares", () => {
  describe("Filtro de Aniversariantes do Mês Atual", () => {
    it("Deve filtrar corretamente os passageiros aniversariantes do mês selecionado", () => {
      const listaPassageiros: PassageiroInput[] = [
        { id: "p1", nome: "Ana Clara", data_nascimento: "2015-08-12T00:00:00.000Z" },
        { id: "p2", nome: "Bruno Souza", data_nascimento: "2014-08-25T00:00:00.000Z" },
        { id: "p3", nome: "Carla Dias", data_nascimento: "2016-05-10T00:00:00.000Z" },
        { id: "p4", nome: "Daniel Lima", data_nascimento: null },
      ];

      const res = filtrarAniversariantesDoMes(listaPassageiros, 8);

      expect(res.aniversariantes).toHaveLength(2);
      expect(res.aniversariantes[0].nome).toBe("Ana Clara");
      expect(res.aniversariantes[0].dia).toBe(12);
      expect(res.aniversariantes[1].nome).toBe("Bruno Souza");
      expect(res.aniversariantes[1].dia).toBe(25);
      expect(res.passageirosSemData).toBe(1);
    });

    it("Deve retornar lista vazia se nenhum passageiro fizer aniversário no mês", () => {
      const listaPassageiros: PassageiroInput[] = [
        { id: "p1", nome: "Ana Clara", data_nascimento: "2015-01-12T00:00:00.000Z" },
      ];

      const res = filtrarAniversariantesDoMes(listaPassageiros, 8);
      expect(res.aniversariantes).toHaveLength(0);
      expect(res.passageirosSemData).toBe(0);
    });
  });

  describe("Vínculo de Passageiro com Turno Escolar", () => {
    it("Deve vincular passageiro aos turnos permitidos: 'manha', 'tarde' e 'integral'", () => {
      const vinculoManha = vincularPassageiroTurnoEscolar("p1", "esc1", "manha");
      expect(vinculoManha.periodo).toBe(PeriodoEnum.MANHA);

      const vinculoTarde = vincularPassageiroTurnoEscolar("p2", "esc1", "TARDE");
      expect(vinculoTarde.periodo).toBe(PeriodoEnum.TARDE);

      const vinculoIntegral = vincularPassageiroTurnoEscolar("p3", "esc2", "integral");
      expect(vinculoIntegral.periodo).toBe(PeriodoEnum.INTEGRAL);
    });

    it("Deve rejeitar vínculo com turno escolar inválido", () => {
      expect(() => vincularPassageiroTurnoEscolar("p1", "esc1", "madrugada")).toThrow(
        "Turno escolar 'madrugada' é inválido. Turnos aceitos: 'manha', 'tarde', 'integral', 'noite'."
      );
    });

    it("Deve filtrar passageiros por escola e turno escolar", () => {
      const lista: PassageiroInput[] = [
        { id: "p1", nome: "Lucas", escola_id: "esc1", periodo: PeriodoEnum.MANHA },
        { id: "p2", nome: "Mariana", escola_id: "esc1", periodo: PeriodoEnum.TARDE },
        { id: "p3", nome: "Pedro", escola_id: "esc1", periodo: PeriodoEnum.MANHA },
        { id: "p4", nome: "Julia", escola_id: "esc2", periodo: PeriodoEnum.MANHA },
      ];

      const resultadoManhaEsc1 = filtrarPassageirosPorTurno(lista, "esc1", PeriodoEnum.MANHA);
      expect(resultadoManhaEsc1).toHaveLength(2);
      expect(resultadoManhaEsc1.map((p) => p.nome)).toEqual(["Lucas", "Pedro"]);
    });
  });
});
