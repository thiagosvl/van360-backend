import { describe, it, expect, vi, beforeEach } from "vitest";
import { isValidFilterValue } from "../src/utils/filter.utils.js";
import { UserType } from "../src/types/enums.js";

const GESTOR_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VAN_UUID = "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22";

// Mock do Supabase Admin para simular retornos do banco sem estourar 22P02 do Postgres
vi.mock("../src/config/supabase.js", () => {
  const createMockQuery = () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      or: () => chain,
      gte: () => chain,
      lte: () => chain,
      is: () => chain,
      in: () => chain,
      order: () => chain,
      range: () => chain,
      limit: () => chain,
      single: async () => ({ data: { id: GESTOR_UUID }, error: null }),
      maybeSingle: async () => ({ data: { id: GESTOR_UUID }, error: null }),
      then: (resolve: any) => resolve({ data: [], error: null }),
    };
    return chain;
  };

  return {
    supabaseAdmin: {
      from: () => createMockQuery(),
    },
  };
});

// Mock da auth para simular usuario logado sem requisição externa
vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any) => {
    request.user = { id: GESTOR_UUID, app_metadata: { role: UserType.MOTORISTA } };
    request.profile = {
      id: GESTOR_UUID,
      tipo: UserType.MOTORISTA,
      conta_pai_id: null,
      veiculo_id: null,
    };
    request.usuario_id = GESTOR_UUID;
    request.data_owner_id = GESTOR_UUID;
    request.assigned_veiculo_id = null;
  },
  verifySupabaseJWT: async () => {},
}));

// Mock da validação de assinatura SaaS
vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

import { createApp } from "../src/app.js";

describe("Suíte de Proteção de Filtros Sentinela ('all', 'TODOS', 'TODAS', 'none', '')", () => {
  describe("1. Testes Unitários de isValidFilterValue", () => {
    it("Deve rejeitar valores sentinelas conhecidos", () => {
      expect(isValidFilterValue("all")).toBe(false);
      expect(isValidFilterValue("ALL")).toBe(false);
      expect(isValidFilterValue("TODOS")).toBe(false);
      expect(isValidFilterValue("todos")).toBe(false);
      expect(isValidFilterValue("TODAS")).toBe(false);
      expect(isValidFilterValue("todas")).toBe(false);
      expect(isValidFilterValue("none")).toBe(false);
      expect(isValidFilterValue("NONE")).toBe(false);
      expect(isValidFilterValue("null")).toBe(false);
      expect(isValidFilterValue("undefined")).toBe(false);
      expect(isValidFilterValue("")).toBe(false);
      expect(isValidFilterValue("   ")).toBe(false);
      expect(isValidFilterValue(null)).toBe(false);
      expect(isValidFilterValue(undefined)).toBe(false);
    });

    it("Deve aceitar valores reais (UUIDs, enums, nomes)", () => {
      expect(isValidFilterValue(VAN_UUID)).toBe(true);
      expect(isValidFilterValue("MANHA")).toBe(true);
      expect(isValidFilterValue("Escola Modelo")).toBe(true);
      expect(isValidFilterValue("unspecified")).toBe(true);
    });
  });

  describe("2. Testes de Integração com API (Fastify In-Memory)", () => {
    let app: any;

    beforeEach(async () => {
      app = await createApp();
    });

    it("GET /api/passageiros/usuario/:usuarioId com filtros sentinela não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/passageiros/usuario/${GESTOR_UUID}?veiculo=all&escola=TODAS&periodo=TODOS&status=all`,
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/gastos/usuario/:usuarioId com veiculo_id=all e categoria=TODOS não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/gastos/usuario/${GESTOR_UUID}?veiculo_id=all&categoria=TODOS`,
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/routes/usuario/:usuarioId com veiculo=all não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/routes/usuario/${GESTOR_UUID}?veiculo=all`,
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/escolas/usuario/:usuarioId com includeId=all e nome=TODAS não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/escolas/usuario/${GESTOR_UUID}?includeId=all&nome=TODAS`,
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/veiculos/usuario/:usuarioId com includeId=all e placa=TODOS não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/veiculos/usuario/${GESTOR_UUID}?includeId=all&placa=TODOS`,
      });
      expect(res.statusCode).toBe(200);
    });

    it("GET /api/cobrancas com veiculoId=all, passageiroId=TODOS e status=none não deve retornar 500", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/cobrancas?veiculoId=all&passageiroId=TODOS&status=none`,
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
