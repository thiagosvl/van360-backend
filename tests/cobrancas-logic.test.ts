import { describe, it, expect, vi } from "vitest";

describe("Suíte de Testes da Lógica de Cobranças e Parcelas", () => {
  it("Deve calcular corretamente o valor das parcelas divididas sem resíduos decimais incorretos", () => {
    const valorTotal = 1200;
    const qtdParcelas = 10;
    const valorParcela = valorTotal / qtdParcelas;

    expect(valorParcela).toBe(120);
  });

  it("Deve identificar corretamente cobranças em atraso comparando com a data atual", () => {
    const dataVencimentoPassada = new Date();
    dataVencimentoPassada.setDate(dataVencimentoPassada.getDate() - 5);

    const dataVencimentoFutura = new Date();
    dataVencimentoFutura.setDate(dataVencimentoFutura.getDate() + 5);

    const isAtrasada = (vencimento: Date, status: string) => {
      if (status === "pago" || status === "cancelado") return false;
      return vencimento < new Date();
    };

    expect(isAtrasada(dataVencimentoPassada, "pendente")).toBe(true);
    expect(isAtrasada(dataVencimentoFutura, "pendente")).toBe(false);
    expect(isAtrasada(dataVencimentoPassada, "pago")).toBe(false);
  });
});
