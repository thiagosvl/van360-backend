import { describe, it, expect, vi, beforeEach } from "vitest";
import { SubscriptionStatus, WhatsappStatus } from "../src/types/enums.js";
import { adminUserService } from "../src/services/admin/admin-user.service.js";
import { adminWhatsappService } from "../src/services/admin/admin-whatsapp.service.js";
import { adminLoginAttemptsService } from "../src/services/admin/admin-login-attempts.service.js";
import { adminUserRepository } from "../src/repositories/admin/admin-user.repository.js";
import { adminWhatsappRepository } from "../src/repositories/admin/admin-whatsapp.repository.js";
import { loginAttemptsRepository } from "../src/repositories/login-attempts.repository.js";
import { whatsappService } from "../src/services/whatsapp.service.js";
import { createApp } from "../src/app.js";

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any) => {
    request.user = { id: "00000000-0000-0000-0000-000000000001", app_metadata: { role: "ADMIN" } };
    request.profile = { id: "00000000-0000-0000-0000-000000000001", tipo: "ADMIN" };
    request.usuario_id = "00000000-0000-0000-0000-000000000001";
  },
  verifySupabaseJWT: async () => {},
}));

vi.mock("../src/middleware/admin.js", () => ({
  verifyAdmin: async () => {},
}));

vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

describe("Suíte de Testes - Métricas SaaS Admin, Instâncias WhatsApp e Tentativas de Login", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("1. Cálculo de Métricas e Dashboard SaaS Global", () => {
    it("Deve calcular corretamente total de frotistas ativos, receita total e contagem por status de assinatura", async () => {
      const mockStats = [
        { count: 15 },
        { count: 120 },
        {
          data: [
            { status: SubscriptionStatus.ACTIVE, data_vencimento: "2026-12-31" },
            { status: SubscriptionStatus.ACTIVE, data_vencimento: null },
            { status: SubscriptionStatus.TRIAL, data_vencimento: null },
            { status: SubscriptionStatus.EXPIRED, data_vencimento: "2026-01-01" },
            { status: SubscriptionStatus.CANCELED, data_vencimento: "2025-05-10" },
          ],
        },
        {
          data: [
            { valor: 99.9, status: "PAID" },
            { valor: 149.9, status: "PAID" },
            { valor: 99.9, status: "PAID" },
          ],
        },
        { data: [] },
        { data: [{ canal_aquisicao: "INSTAGRAM", dispositivo_cadastro: "APP_ANDROID" }] },
        { data: [{ status: "ASSINADO", valor_total: 5000 }] },
        { data: [{ assinatura_digital_url: "http://sig.png", config_contrato: { usar_contratos: true } }] },
        { data: [{ status: "COMPLETED" }] },
      ];

      vi.spyOn(adminUserRepository, "getDashboardStats").mockResolvedValue(mockStats as any);
      vi.spyOn(whatsappService, "getInstanceStatus").mockResolvedValue({ state: "open" } as any);

      const stats = await adminUserService.getDashboardStats();

      expect(stats.totalMotoristas).toBe(15);
      expect(stats.totalPassageiros).toBe(120);
      expect(stats.receitaTotal).toBeCloseTo(349.7, 2);
      expect(stats.assinaturas.active).toBe(1);
      expect(stats.assinaturas.vitalicio).toBe(1);
      expect(stats.assinaturas.trial).toBe(1);
      expect(stats.assinaturas.expired).toBe(1);
      expect(stats.assinaturas.canceled).toBe(1);
    });

    it("Deve tratar receitas nulas ou zeradas sem gerar exceções", async () => {
      const mockStatsEmpty = [
        { count: 0 },
        { count: 0 },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
        { data: [] },
      ];

      vi.spyOn(adminUserRepository, "getDashboardStats").mockResolvedValue(mockStatsEmpty as any);
      vi.spyOn(whatsappService, "getInstanceStatus").mockResolvedValue({ state: "close" } as any);

      const stats = await adminUserService.getDashboardStats();

      expect(stats.totalMotoristas).toBe(0);
      expect(stats.receitaTotal).toBe(0);
      expect(stats.assinaturas.active).toBe(0);
    });
  });

  describe("2. Gestão e Monitoramento de Instâncias WhatsApp", () => {
    it("Deve enriquecer os dados da instância com o status ao vivo da Evolution API", async () => {
      vi.spyOn(adminWhatsappRepository, "getWhatsappInstances").mockResolvedValue({
        data: [
          { id: "inst-1", instance_name: "van360_global", usuario_id: "user-1" },
        ],
        error: null,
      } as any);

      vi.spyOn(whatsappService, "getInstanceStatus").mockResolvedValue({
        state: "open",
        statusReason: 200,
      } as any);

      const instances = await adminWhatsappService.getWhatsappInstances();

      expect(instances).toHaveLength(1);
      expect(instances[0].instance_name).toBe("van360_global");
      expect(instances[0].evolution_status).toBe("open");
    });

    it("Deve retornar status UNKNOWN quando houver falha de comunicação com o Evolution API", async () => {
      vi.spyOn(adminWhatsappRepository, "getWhatsappInstances").mockResolvedValue({
        data: [
          { id: "inst-2", instance_name: "van360_offline", usuario_id: "user-2" },
        ],
        error: null,
      } as any);

      vi.spyOn(whatsappService, "getInstanceStatus").mockRejectedValue(new Error("Timeout Evolution API"));

      const instances = await adminWhatsappService.getWhatsappInstances();

      expect(instances).toHaveLength(1);
      expect(instances[0].evolution_status).toBe(WhatsappStatus.UNKNOWN);
    });
  });

  describe("3. Auditoria de Tentativas de Login SaaS", () => {
    it("Deve calcular offset e paginação corretamente ao buscar tentativas de login", async () => {
      vi.spyOn(loginAttemptsRepository, "listAttempts").mockResolvedValue({
        data: [
          { id: "log-1", cpf: "12345678900", sucesso: true, ip: "192.168.1.1" },
        ],
        count: 45,
        error: null,
      } as any);

      const result = await adminLoginAttemptsService.getLoginAttempts({ page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(45);
      expect(result.data).toHaveLength(1);
      expect(loginAttemptsRepository.listAttempts).toHaveBeenCalledWith(
        { page: 2, limit: 10 },
        10,
        19
      );
    });
  });

  describe("4. Endpoints HTTP Fastify (Admin Routes)", () => {
    it("GET /api/admin/dashboard - Deve retornar status HTTP 200 e métricas do SaaS", async () => {
      vi.spyOn(adminUserService, "getDashboardStats").mockResolvedValue({
        totalMotoristas: 10,
        totalPassageiros: 50,
        receitaTotal: 1500,
        assinaturas: { active: 10, trial: 0, vitalicio: 0, past_due: 0, expired: 0, canceled: 0 },
        recentUsers: [],
      } as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/dashboard",
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.totalMotoristas).toBe(10);
      expect(payload.receitaTotal).toBe(1500);
    });

    it("GET /api/admin/whatsapp-instances - Deve retornar status HTTP 200 e instâncias", async () => {
      vi.spyOn(adminWhatsappService, "getWhatsappInstances").mockResolvedValue([
        { id: "1", instance_name: "inst_1", evolution_status: "open" },
      ]);

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/whatsapp-instances",
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toHaveLength(1);
      expect(payload[0].evolution_status).toBe("open");
    });

    it("GET /api/admin/login-attempts - Deve retornar status HTTP 200 e relatório paginado", async () => {
      vi.spyOn(adminLoginAttemptsService, "getLoginAttempts").mockResolvedValue({
        data: [{ id: "1", cpf: "00000000000", sucesso: false }],
        total: 1,
        page: 1,
        limit: 20,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/admin/login-attempts?page=1&limit=20",
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.total).toBe(1);
      expect(payload.data[0].sucesso).toBe(false);
    });
  });
});
