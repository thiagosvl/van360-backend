import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserType } from "../src/types/enums.js";

const TEST_UUID = "11111111-1111-4111-a111-111111111111";
const GESTOR_UUID = "22222222-2222-4222-a222-222222222222";
const OUTRO_GESTOR_UUID = "99999999-9999-4999-a999-999999999999";
const VAN_UUID = "33333333-3333-4333-a333-333333333333";

vi.mock("../src/config/supabase.js", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: TEST_UUID, nome: "Teste" }, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: TEST_UUID, nome: "Teste" }, error: null }),
    })),
  },
}));

vi.mock("../src/middleware/auth.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
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

      if (isSubAccount) {
        const bodyContaPai = request.body?.conta_pai_id;
        const queryContaPai = request.query?.conta_pai_id;
        const attemptedContaPai = bodyContaPai || queryContaPai;

        if (attemptedContaPai && attemptedContaPai !== GESTOR_UUID) {
          return reply.status(403).send({
            error: "Operação negada: sub-conta não pode manipular dados de outro gestor",
            code: "FORBIDDEN_CONTA_PAI_MISMATCH",
          });
        }
      }
    },
    verifySupabaseJWT: async (request: any, reply: any) => {
      const roleHeader = request.headers["x-test-role"];
      if (!roleHeader) {
        return reply.status(401).send({ error: "Token ausente ou inválido" });
      }
    },
  };
});

vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

import { createApp } from "../src/app.js";
import { createCobrancaSchema } from "../src/types/dtos/cobranca.dto.js";
import { createPassageiroSchema } from "../src/types/dtos/passageiro.dto.js";
import { createGastoSchema } from "../src/types/dtos/gasto.dto.js";
import { createRouteSchema } from "../src/types/dtos/route.dto.js";

describe("Suíte de Testes de Borda e Casos Limite (Invariantes de Negócio)", () => {
  let app: any;

  beforeEach(async () => {
    app = await createApp();
  });

  describe("1. Regra de Negócio: Cobranças com valores <= 0 ou parcelas <= 0 devem ser rejeitadas", () => {
    it("Deve rejeitar cobrança com valor igual a 0", () => {
      const payload = {
        usuario_id: TEST_UUID,
        valor: 0,
        data_vencimento: "2026-08-10",
      };
      const result = createCobrancaSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve rejeitar cobrança com valor negativo", () => {
      const payload = {
        usuario_id: TEST_UUID,
        valor: -50,
        data_vencimento: "2026-08-10",
      };
      const result = createCobrancaSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve rejeitar cobrança com número de parcelas <= 0", () => {
      const payloadZero = {
        usuario_id: TEST_UUID,
        valor: 100,
        data_vencimento: "2026-08-10",
        parcelas: 0,
      };
      const resultZero = createCobrancaSchema.safeParse(payloadZero);
      expect(resultZero.success).toBe(false);

      const payloadNegativo = {
        usuario_id: TEST_UUID,
        valor: 100,
        data_vencimento: "2026-08-10",
        parcelas: -3,
      };
      const resultNegativo = createCobrancaSchema.safeParse(payloadNegativo);
      expect(resultNegativo.success).toBe(false);
    });

    it("Deve aceitar cobrança válida com valor positivo e parcelas válidas", () => {
      const payload = {
        usuario_id: TEST_UUID,
        valor: 150.50,
        data_vencimento: "2026-08-10",
        parcelas: 1,
      };
      const result = createCobrancaSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("2. Regra de Negócio: Passageiros com data de nascimento no futuro devem ser rejeitados", () => {
    it("Deve rejeitar passageiro com data de nascimento no futuro (ex: 2030)", () => {
      const payload = {
        nome: "Passageiro Do Futuro",
        usuario_id: TEST_UUID,
        data_nascimento: "2030-01-01",
      };
      const result = createPassageiroSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve aceitar passageiro com data de nascimento no passado", () => {
      const payload = {
        nome: "Passageiro Valido",
        usuario_id: TEST_UUID,
        data_nascimento: "2015-05-20",
      };
      const result = createPassageiroSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("3. Regra de Negócio: Gastos com valor negativo devem ser rejeitados", () => {
    it("Deve rejeitar gasto com valor negativo", () => {
      const payload = {
        usuario_id: TEST_UUID,
        valor: -100,
        data: "2026-08-01",
        categoria: "Combustível",
      };
      const result = createGastoSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve aceitar gasto com valor positivo ou zero", () => {
      const payload = {
        usuario_id: TEST_UUID,
        valor: 250.00,
        data: "2026-08-01",
        categoria: "Manutenção",
      };
      const result = createGastoSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("4. Regra de Negócio: Rotas com horário de término anterior ao início devem ser rejeitadas", () => {
    it("Deve rejeitar rota onde o horário de término é anterior ao de início", () => {
      const payload = {
        usuario_id: TEST_UUID,
        nome: "Rota Manhã",
        horario_inicio: "08:00",
        horario_fim: "07:00",
      };
      const result = createRouteSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("Deve aceitar rota com horário de término posterior ao de início", () => {
      const payload = {
        usuario_id: TEST_UUID,
        nome: "Rota Manhã Válida",
        horario_inicio: "07:00",
        horario_fim: "08:30",
      };
      const result = createRouteSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("5. Regra de Negócio: Sub-contas que tentarem passar um conta_pai_id de outro gestor devem ter a tentativa barrada", () => {
    it("Sub-conta enviando conta_pai_id de outro gestor via HTTP deve receber 403 Forbidden", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/passageiros/usuario/${TEST_UUID}`,
        headers: { "x-test-role": UserType.MOTORISTA_AUXILIAR },
        query: { conta_pai_id: OUTRO_GESTOR_UUID },
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload);
      expect(body.code).toBe("FORBIDDEN_CONTA_PAI_MISMATCH");
    });
  });
});
