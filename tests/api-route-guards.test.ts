import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserType } from "../src/types/enums.js";

const TEST_UUID = "00000000-0000-0000-0000-000000000001";
const GESTOR_UUID = "00000000-0000-0000-0000-000000000002";
const VAN_UUID = "00000000-0000-0000-0000-000000000003";

// Mock do middleware de auth para simular chamadas dos 3 perfis
vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any, reply: any) => {
    const roleHeader = request.headers["x-test-role"];
    if (!roleHeader) {
      return reply.status(401).send({ error: "Token ausente ou inválido" });
    }

    const role = roleHeader as UserType;
    const isSubAccount = role === UserType.MOTORISTA_AUXILIAR || role === UserType.MONITOR;

    request.user = { id: TEST_UUID, app_metadata: { role } };
    request.profile = {
      id: TEST_UUID,
      tipo: role,
      conta_pai_id: isSubAccount ? GESTOR_UUID : null,
      veiculo_id: isSubAccount ? VAN_UUID : null,
    };
    request.usuario_id = TEST_UUID;
    request.data_owner_id = isSubAccount ? GESTOR_UUID : TEST_UUID;
    request.assigned_veiculo_id = isSubAccount ? VAN_UUID : null;
  },
  verifySupabaseJWT: async (request: any, reply: any) => {
    const roleHeader = request.headers["x-test-role"];
    if (!roleHeader) {
      return reply.status(401).send({ error: "Token ausente ou inválido" });
    }
  }
}));

// Mock do middleware de subscription para evitar requisições externas
vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

import { createApp } from "../src/app.js";

describe("Suíte Completa de Testes de Rota por Papel (Fastify In-Memory)", () => {
  let app: any;

  beforeEach(async () => {
    app = await createApp();
  });

  describe("1. Frotista Principal (MOTORISTA / Dono da Conta)", () => {
    it("Dono da Frota DEVE ter acesso livre (NÃO traz 403 Forbidden) em TODOS os módulos", async () => {
      const routesToTest = [
        { method: "GET", url: "/api/cobrancas" },
        { method: "GET", url: "/api/contratos" },
        { method: "GET", url: `/api/veiculos/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/historico/usuario/${TEST_UUID}` },
        { method: "GET", url: "/api/subscriptions/invoices" },
        { method: "GET", url: "/api/motoristas-equipe" },
        { method: "GET", url: `/api/gastos/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/passageiros/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/routes/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/escolas/usuario/${TEST_UUID}` },
      ];

      for (const r of routesToTest) {
        const res = await app.inject({
          method: r.method as any,
          url: r.url,
          headers: { "x-test-role": UserType.MOTORISTA },
        });
        expect(res.statusCode).not.toBe(403);
        expect(res.statusCode).not.toBe(401);
      }
    });
  });

  describe("2. Motorista Auxiliar (MOTORISTA_AUXILIAR)", () => {
    it("Auxiliar DEVE ter acesso a Rotas, Gastos, Passageiros e Listagem de Veículos (leitura da van)", async () => {
      const allowedRoutes = [
        { method: "GET", url: `/api/routes/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/gastos/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/veiculos/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/passageiros/usuario/${TEST_UUID}` },
      ];

      for (const r of allowedRoutes) {
        const res = await app.inject({
          method: r.method as any,
          url: r.url,
          headers: { "x-test-role": UserType.MOTORISTA_AUXILIAR },
        });
        expect(res.statusCode).not.toBe(403);
      }
    });

    it("Auxiliar DEVE SER BLOQUEADO (403 Forbidden) em Equipe, Gestão de Escolas, Criação de Passageiros, Cobranças, Contratos, Gestão de Veículos, Relatórios e Assinatura", async () => {
      const blockedRoutes = [
        { method: "GET", url: "/api/motoristas-equipe" },
        { method: "POST", url: "/api/escolas" },
        { method: "POST", url: "/api/passageiros" },
        { method: "GET", url: "/api/cobrancas" },
        { method: "GET", url: "/api/contratos" },
        { method: "POST", url: "/api/veiculos" },
        { method: "GET", url: `/api/historico/usuario/${TEST_UUID}` },
        { method: "GET", url: "/api/subscriptions/invoices" },
        { method: "PATCH", url: `/api/motoristas-equipe/${TEST_UUID}/status` },
      ];

      for (const r of blockedRoutes) {
        const res = await app.inject({
          method: r.method as any,
          url: r.url,
          headers: { "x-test-role": UserType.MOTORISTA_AUXILIAR },
        });
        expect(res.statusCode).toBe(403);
      }
    });
  });

  describe("3. Monitor (MONITOR)", () => {
    it("Monitor DEVE ter acesso a Rotas, Passageiros, Escolas (leitura) e Listagem de Veículos (leitura da van)", async () => {
      const allowedRoutes = [
        { method: "GET", url: `/api/routes/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/veiculos/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/passageiros/usuario/${TEST_UUID}` },
        { method: "GET", url: `/api/escolas/usuario/${TEST_UUID}` },
      ];

      for (const r of allowedRoutes) {
        const res = await app.inject({
          method: r.method as any,
          url: r.url,
          headers: { "x-test-role": UserType.MONITOR },
        });
        expect(res.statusCode).not.toBe(403);
      }
    });

    it("Monitor DEVE SER BLOQUEADO (403 Forbidden) em Criação de Passageiros, Gestão de Escolas, Gastos, Cobranças, Contratos, Gestão de Veículos, Relatórios e Equipe", async () => {
      const blockedRoutes = [
        { method: "POST", url: "/api/passageiros" },
        { method: "POST", url: "/api/escolas" },
        { method: "GET", url: `/api/gastos/usuario/${TEST_UUID}` },
        { method: "GET", url: "/api/cobrancas" },
        { method: "GET", url: "/api/contratos" },
        { method: "POST", url: "/api/veiculos" },
        { method: "GET", url: `/api/historico/usuario/${TEST_UUID}` },
        { method: "GET", url: "/api/motoristas-equipe" },
        { method: "GET", url: "/api/subscriptions/invoices" },
      ];

      for (const r of blockedRoutes) {
        const res = await app.inject({
          method: r.method as any,
          url: r.url,
          headers: { "x-test-role": UserType.MONITOR },
        });
        expect(res.statusCode).toBe(403);
      }
    });
  });
});
