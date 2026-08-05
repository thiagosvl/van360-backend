import { describe, it, expect } from "vitest";
import { RouteStopStatus } from "../src/types/enums.js";

interface Parada {
  id: string;
  nome: string;
  horario: string;
  ordem: number;
  status: RouteStopStatus;
}

const REGRAS_TRANSICAO: Record<RouteStopStatus, RouteStopStatus[]> = {
  [RouteStopStatus.PENDENTE]: [RouteStopStatus.EMBARCADO, RouteStopStatus.AUSENTE],
  [RouteStopStatus.EMBARCADO]: [RouteStopStatus.DESEMBARCADO, RouteStopStatus.PENDENTE],
  [RouteStopStatus.DESEMBARCADO]: [RouteStopStatus.PENDENTE],
  [RouteStopStatus.AUSENTE]: [RouteStopStatus.PENDENTE],
};

function transitarStatusParada(statusAtual: RouteStopStatus, novoStatus: RouteStopStatus): RouteStopStatus {
  if (statusAtual === novoStatus) {
    return statusAtual;
  }
  const permitidos = REGRAS_TRANSICAO[statusAtual] || [];
  if (!permitidos.includes(novoStatus)) {
    throw new Error(`Transição de status inválida: de '${statusAtual}' para '${novoStatus}'.`);
  }
  return novoStatus;
}

function converterHorarioParaMinutos(horario: string): number {
  const partes = horario.split(":");
  if (partes.length !== 2) return 0;
  const horas = parseInt(partes[0], 10) || 0;
  const minutos = parseInt(partes[1], 10) || 0;
  return horas * 60 + minutos;
}

function ordenarParadasPorHorario(paradas: Parada[]): Parada[] {
  return [...paradas].sort((a, b) => {
    const minA = converterHorarioParaMinutos(a.horario);
    const minB = converterHorarioParaMinutos(b.horario);
    if (minA !== minB) {
      return minA - minB;
    }
    return a.ordem - b.ordem;
  });
}

describe("Suíte de Testes de Execução de Rotas e Paradas", () => {
  describe("Transições de Status de Parada", () => {
    it("Deve permitir a transição de 'pendente' para 'embarcado'", () => {
      const res = transitarStatusParada(RouteStopStatus.PENDENTE, RouteStopStatus.EMBARCADO);
      expect(res).toBe(RouteStopStatus.EMBARCADO);
    });

    it("Deve permitir a transição de 'embarcado' para 'desembarcado'", () => {
      const res = transitarStatusParada(RouteStopStatus.EMBARCADO, RouteStopStatus.DESEMBARCADO);
      expect(res).toBe(RouteStopStatus.DESEMBARCADO);
    });

    it("Deve permitir a transição de 'pendente' para 'ausente'", () => {
      const res = transitarStatusParada(RouteStopStatus.PENDENTE, RouteStopStatus.AUSENTE);
      expect(res).toBe(RouteStopStatus.AUSENTE);
    });

    it("Deve permitir reversão de 'embarcado', 'desembarcado' e 'ausente' para 'pendente'", () => {
      expect(transitarStatusParada(RouteStopStatus.EMBARCADO, RouteStopStatus.PENDENTE)).toBe(RouteStopStatus.PENDENTE);
      expect(transitarStatusParada(RouteStopStatus.DESEMBARCADO, RouteStopStatus.PENDENTE)).toBe(RouteStopStatus.PENDENTE);
      expect(transitarStatusParada(RouteStopStatus.AUSENTE, RouteStopStatus.PENDENTE)).toBe(RouteStopStatus.PENDENTE);
    });

    it("Deve rejeitar transições diretas inválidas como 'pendente' para 'desembarcado'", () => {
      expect(() => transitarStatusParada(RouteStopStatus.PENDENTE, RouteStopStatus.DESEMBARCADO)).toThrow(
        "Transição de status inválida: de 'pendente' para 'desembarcado'."
      );
    });

    it("Deve rejeitar transição direta de 'ausente' para 'embarcado'", () => {
      expect(() => transitarStatusParada(RouteStopStatus.AUSENTE, RouteStopStatus.EMBARCADO)).toThrow(
        "Transição de status inválida: de 'ausente' para 'embarcado'."
      );
    });

    it("Deve manter o mesmo status se o novo status for idêntico ao atual", () => {
      expect(transitarStatusParada(RouteStopStatus.EMBARCADO, RouteStopStatus.EMBARCADO)).toBe(RouteStopStatus.EMBARCADO);
    });
  });

  describe("Ordenação de Paradas por Horário", () => {
    it("Deve ordenar paradas por horário cronológico de forma crescente", () => {
      const paradasDesordenadas: Parada[] = [
        { id: "1", nome: "Parada C", horario: "08:15", ordem: 1, status: RouteStopStatus.PENDENTE },
        { id: "2", nome: "Parada A", horario: "06:45", ordem: 2, status: RouteStopStatus.PENDENTE },
        { id: "3", nome: "Parada B", horario: "07:30", ordem: 3, status: RouteStopStatus.PENDENTE },
      ];

      const ordenadas = ordenarParadasPorHorario(paradasDesordenadas);
      expect(ordenadas.map((p) => p.id)).toEqual(["2", "3", "1"]);
      expect(ordenadas.map((p) => p.horario)).toEqual(["06:45", "07:30", "08:15"]);
    });

    it("Deve utilizar a ordem original como critério de desempate para horários idênticos", () => {
      const paradasMesmoHorario: Parada[] = [
        { id: "10", nome: "Parada X", horario: "07:00", ordem: 2, status: RouteStopStatus.PENDENTE },
        { id: "11", nome: "Parada Y", horario: "07:00", ordem: 1, status: RouteStopStatus.PENDENTE },
      ];

      const ordenadas = ordenarParadasPorHorario(paradasMesmoHorario);
      expect(ordenadas[0].id).toBe("11");
      expect(ordenadas[1].id).toBe("10");
    });
  });
});
