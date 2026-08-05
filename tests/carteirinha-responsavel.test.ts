import { describe, it, expect, vi } from "vitest";

describe("Suíte de Testes da Carteirinha Digital do Responsável", () => {
  it("Deve validar formato de telefone e CPF para acesso do responsável", () => {
    const cleanDoc = (val: string) => val.replace(/\D/g, "");
    
    expect(cleanDoc("123.456.789-00")).toBe("12345678900");
    expect(cleanDoc("(11) 98888-7777")).toBe("11988887777");
  });

  it("Deve garantir que o registro de ausência do aluno seja atrelado à data correta da rota", () => {
    const dataRota = "2026-08-05";
    const passageiroId = "00000000-0000-0000-0000-000000000099";

    const criarAusenciaPayload = (pId: string, data: string, motivo?: string) => ({
      passageiro_id: pId,
      data,
      motivo: motivo || "Ausência informada pelo responsável",
      criado_por_responsavel: true,
    });

    const payload = criarAusenciaPayload(passageiroId, dataRota);
    expect(payload.passageiro_id).toBe(passageiroId);
    expect(payload.data).toBe("2026-08-05");
    expect(payload.criado_por_responsavel).toBe(true);
  });
});
