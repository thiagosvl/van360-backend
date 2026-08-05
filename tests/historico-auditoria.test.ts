import { describe, it, expect, vi, beforeEach } from "vitest";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../src/types/enums.js";
import { historicoService } from "../src/services/historico.service.js";
import { historicoRepository } from "../src/repositories/historico.repository.js";
import { createApp } from "../src/app.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_ENTIDADE_ID = "00000000-0000-0000-0000-000000000099";

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any, reply: any) => {
    const roleHeader = request.headers["x-test-role"];
    if (request.headers.authorization === "Bearer invalid_token") {
      return reply.status(401).send({ error: "Token inválido" });
    }
    request.user = { id: TEST_USER_ID, app_metadata: { role: "MOTORISTA" } };
    request.profile = { id: TEST_USER_ID, tipo: "MOTORISTA" };
    request.usuario_id = TEST_USER_ID;
  },
  verifySupabaseJWT: async () => {},
}));

vi.mock("../src/middleware/permissions.middleware.js", () => ({
  requirePermission: () => async () => {},
}));

vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

describe("Suíte de Testes - Gravação e Consulta de Logs de Auditoria (activity_logs)", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("1. Gravação Individual e em Lote (historicoService.log / bulkLog)", () => {
    it("Deve registrar log individual com usuário, entidade, ação e IP de contexto", async () => {
      const insertSpy = vi.spyOn(historicoRepository, "insert").mockResolvedValue({
        data: { id: "log-1" },
        error: null,
      } as any);

      await historicoService.log({
        usuario_id: TEST_USER_ID,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: TEST_ENTIDADE_ID,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: "Cobrança gerada para passageiro.",
        meta: { valor: 350.0 },
        ip_address: "200.150.10.5",
      });

      expect(insertSpy).toHaveBeenCalledWith({
        usuario_id: TEST_USER_ID,
        entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
        entidade_id: TEST_ENTIDADE_ID,
        acao: AtividadeAcao.COBRANCA_CRIADA,
        descricao: "Cobrança gerada para passageiro.",
        meta: { valor: 350.0 },
        ip_address: "200.150.10.5",
      });
    });

    it("Deve realizar bulkLog de múltiplos eventos de auditoria", async () => {
      const bulkSpy = vi.spyOn(historicoRepository, "insertBulk").mockResolvedValue({
        data: [{ id: "log-1" }, { id: "log-2" }],
        error: null,
      } as any);

      const logsToInsert = [
        {
          usuario_id: TEST_USER_ID,
          entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
          entidade_id: "p1",
          acao: AtividadeAcao.PASSAGEIRO_CRIADO,
          descricao: "Passageiro 1 cadastrado.",
        },
        {
          usuario_id: TEST_USER_ID,
          entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
          entidade_id: "p2",
          acao: AtividadeAcao.PASSAGEIRO_CRIADO,
          descricao: "Passageiro 2 cadastrado.",
        },
      ];

      await historicoService.bulkLog(logsToInsert);

      expect(bulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ entidade_id: "p1" }),
          expect.objectContaining({ entidade_id: "p2" }),
        ])
      );
    });

    it("Deve ignorar bulkLog silenciosamente quando a lista de logs for vazia", async () => {
      const bulkSpy = vi.spyOn(historicoRepository, "insertBulk");
      await historicoService.bulkLog([]);
      expect(bulkSpy).not.toHaveBeenCalled();
    });

    it("Não deve interromper a aplicação se houver falha na inserção do log", async () => {
      vi.spyOn(historicoRepository, "insert").mockRejectedValue(new Error("Erro de conexão DB"));

      await expect(
        historicoService.log({
          usuario_id: TEST_USER_ID,
          entidade_tipo: AtividadeEntidadeTipo.ROTA,
          entidade_id: "r1",
          acao: AtividadeAcao.ROTA_INICIADA,
          descricao: "Início de rota",
        })
      ).resolves.not.toThrow();
    });
  });

  describe("2. Consulta de Atividades e Histórico", () => {
    it("Deve listar histórico de uma entidade específica por tipo e ID", async () => {
      const mockData = [
        {
          id: "log-1",
          entidade_tipo: AtividadeEntidadeTipo.COBRANCA,
          entidade_id: TEST_ENTIDADE_ID,
          acao: AtividadeAcao.COBRANCA_PAGA,
          created_at: "2026-08-05T10:00:00.000Z",
        },
      ];

      vi.spyOn(historicoRepository, "listByEntidade").mockResolvedValue({
        data: mockData,
        error: null,
      } as any);

      const logs = await historicoService.listByEntidade(AtividadeEntidadeTipo.COBRANCA, TEST_ENTIDADE_ID);

      expect(logs).toHaveLength(1);
      expect(logs[0].acao).toBe(AtividadeAcao.COBRANCA_PAGA);
      expect(historicoRepository.listByEntidade).toHaveBeenCalledWith(
        AtividadeEntidadeTipo.COBRANCA,
        TEST_ENTIDADE_ID
      );
    });

    it("Deve listar atividades globais de um usuário frotista", async () => {
      const mockUserData = [
        { id: "log-10", acao: AtividadeAcao.PERFIL_EDITADO },
        { id: "log-11", acao: AtividadeAcao.CHAVE_PIX_ALTERADA },
      ];

      vi.spyOn(historicoRepository, "listByUsuario").mockResolvedValue({
        data: mockUserData,
        error: null,
      } as any);

      const logs = await historicoService.listByUsuario(TEST_USER_ID, 20);

      expect(logs).toHaveLength(2);
      expect(historicoRepository.listByUsuario).toHaveBeenCalledWith(TEST_USER_ID, 20);
    });
  });

  describe("3. Endpoints HTTP Fastify (Historico Routes)", () => {
    it("GET /api/historico/entidade/:entidadeTipo/:entidadeId - Deve retornar HTTP 200 e histórico", async () => {
      vi.spyOn(historicoService, "listByEntidade").mockResolvedValue([
        {
          id: "log-1",
          usuario_id: TEST_USER_ID,
          entidade_tipo: AtividadeEntidadeTipo.PASSAGEIRO,
          entidade_id: TEST_ENTIDADE_ID,
          acao: AtividadeAcao.PASSAGEIRO_EDITADO,
          descricao: "Dados alterados",
          created_at: "2026-08-05T12:00:00.000Z",
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: `/api/historico/entidade/${AtividadeEntidadeTipo.PASSAGEIRO}/${TEST_ENTIDADE_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toHaveLength(1);
      expect(payload[0].acao).toBe(AtividadeAcao.PASSAGEIRO_EDITADO);
    });

    it("GET /api/historico/usuario/:usuarioId - Deve retornar HTTP 200 e atividades do usuário", async () => {
      vi.spyOn(historicoService, "listByUsuario").mockResolvedValue([
        {
          id: "log-2",
          usuario_id: TEST_USER_ID,
          entidade_tipo: AtividadeEntidadeTipo.USUARIO,
          entidade_id: TEST_USER_ID,
          acao: AtividadeAcao.PERFIL_EDITADO,
          descricao: "Perfil atualizado",
          created_at: "2026-08-05T12:00:00.000Z",
        },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: `/api/historico/usuario/${TEST_USER_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toHaveLength(1);
      expect(payload[0].acao).toBe(AtividadeAcao.PERFIL_EDITADO);
    });

    it("GET /api/historico/usuario/:usuarioId - Deve retornar 401 se o token for inválido", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/api/historico/usuario/${TEST_USER_ID}`,
        headers: { authorization: "Bearer invalid_token" },
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
