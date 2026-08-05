import { describe, it, expect, vi, beforeEach } from "vitest";
import { gastoCategoriaService } from "../src/services/gasto-categoria.service.js";
import { gastoCategoriaRepository } from "../src/repositories/gasto-categoria.repository.js";
import { createApp } from "../src/app.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000002";
const CAT_CUSTOM_ID = "11111111-1111-4111-a111-111111111111";
const CAT_SYSTEM_ID = "99999999-9999-4999-a999-999999999999";

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any) => {
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

describe("Suíte de Testes - Categorias Customizadas de Gastos", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("1. Criação e Validação de Slugs / Categorias Reservadas", () => {
    it("Deve criar categoria customizada com slug gerado corretamente (remoção de acentos e espaços)", async () => {
      vi.spyOn(gastoCategoriaRepository, "getBySlugAndUsuario").mockResolvedValue({ data: null, error: null } as any);
      vi.spyOn(gastoCategoriaRepository, "getByNomeAndUsuario").mockResolvedValue({ data: null, error: null } as any);
      vi.spyOn(gastoCategoriaRepository, "insert").mockResolvedValue({
        data: {
          id: CAT_CUSTOM_ID,
          usuario_id: TEST_USER_ID,
          nome: "Estacionamento & Pedágio",
          slug: "estacionamento-pedagio",
          cor: "blue",
          icone: "Car",
        },
        error: null,
      } as any);

      const res = await gastoCategoriaService.createCategoria(TEST_USER_ID, {
        nome: "Estacionamento & Pedágio",
        cor: "blue",
        icone: "Car",
      });

      expect(res.slug).toBe("estacionamento-pedagio");
      expect(gastoCategoriaRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: TEST_USER_ID,
          nome: "Estacionamento & Pedágio",
          slug: "estacionamento-pedagio",
        })
      );
    });

    it("Deve rejeitar a criação de categorias com slugs globais reservados pelo sistema", async () => {
      const slugsReservados = ["Combustível", "Manutenção", "Impostos", "Multas", "Lavagem", "Alimentação", "Seguro", "Outros"];

      for (const nomeReservado of slugsReservados) {
        await expect(
          gastoCategoriaService.createCategoria(TEST_USER_ID, { nome: nomeReservado })
        ).rejects.toThrow("Esta categoria é reservada pelo sistema.");
      }
    });

    it("Deve rejeitar a criação se o usuário já possuir categoria com nome ou slug idêntico", async () => {
      vi.spyOn(gastoCategoriaRepository, "getBySlugAndUsuario").mockResolvedValue({
        data: { id: "existente", nome: "Pedágio Extra" },
        error: null,
      } as any);
      vi.spyOn(gastoCategoriaRepository, "getByNomeAndUsuario").mockResolvedValue({ data: null, error: null } as any);

      await expect(
        gastoCategoriaService.createCategoria(TEST_USER_ID, { nome: "Pedágio Extra" })
      ).rejects.toThrow("Você já possui uma categoria com este nome.");
    });
  });

  describe("2. Listagem, Edição e Exclusão de Categorias", () => {
    it("Deve listar todas as categorias do usuário", async () => {
      const mockCategorias = [
        { id: CAT_SYSTEM_ID, usuario_id: null, nome: "Combustível", slug: "combustivel" },
        { id: CAT_CUSTOM_ID, usuario_id: TEST_USER_ID, nome: "Estacionamento", slug: "estacionamento" },
      ];

      vi.spyOn(gastoCategoriaRepository, "list").mockResolvedValue({
        data: mockCategorias,
        error: null,
      } as any);

      const lista = await gastoCategoriaService.listCategorias(TEST_USER_ID);

      expect(lista).toHaveLength(2);
      expect(gastoCategoriaRepository.list).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it("Deve impedir a alteração de categorias padrão do sistema (usuario_id null)", async () => {
      vi.spyOn(gastoCategoriaRepository, "getById").mockResolvedValue({
        data: { id: CAT_SYSTEM_ID, usuario_id: null, nome: "Combustível" },
        error: null,
      } as any);

      await expect(
        gastoCategoriaService.updateCategoria(CAT_SYSTEM_ID, TEST_USER_ID, { cor: "red" })
      ).rejects.toThrow("Não é possível alterar categorias padrão do sistema.");
    });

    it("Deve impedir a exclusão de categorias pertencentes a outro frotista", async () => {
      vi.spyOn(gastoCategoriaRepository, "getById").mockResolvedValue({
        data: { id: CAT_CUSTOM_ID, usuario_id: OTHER_USER_ID, nome: "Outro Frotista Cat" },
        error: null,
      } as any);

      await expect(
        gastoCategoriaService.deleteCategoria(CAT_CUSTOM_ID, TEST_USER_ID)
      ).rejects.toThrow("Você não tem permissão para excluir esta categoria.");
    });

    it("Deve permitir a exclusão de categoria customizada pertencente ao próprio frotista", async () => {
      vi.spyOn(gastoCategoriaRepository, "getById").mockResolvedValue({
        data: { id: CAT_CUSTOM_ID, usuario_id: TEST_USER_ID, nome: "Minha Categoria" },
        error: null,
      } as any);

      vi.spyOn(gastoCategoriaRepository, "delete").mockResolvedValue({ error: null } as any);

      const res = await gastoCategoriaService.deleteCategoria(CAT_CUSTOM_ID, TEST_USER_ID);

      expect(res.success).toBe(true);
      expect(gastoCategoriaRepository.delete).toHaveBeenCalledWith(CAT_CUSTOM_ID);
    });
  });

  describe("3. Endpoints HTTP Fastify (Gasto Categoria Routes)", () => {
    it("GET /api/gasto-categorias - Deve retornar HTTP 200 e lista de categorias", async () => {
      vi.spyOn(gastoCategoriaService, "listCategorias").mockResolvedValue([
        { id: CAT_CUSTOM_ID, nome: "Estacionamento", slug: "estacionamento" },
      ] as any);

      const res = await app.inject({
        method: "GET",
        url: "/api/gasto-categorias",
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toHaveLength(1);
    });

    it("POST /api/gasto-categorias - Deve retornar HTTP 201 ao criar nova categoria", async () => {
      vi.spyOn(gastoCategoriaService, "createCategoria").mockResolvedValue({
        id: CAT_CUSTOM_ID,
        nome: "Higienização",
        slug: "higienizacao",
      } as any);

      const res = await app.inject({
        method: "POST",
        url: "/api/gasto-categorias",
        payload: {
          nome: "Higienização",
          cor: "green",
        },
      });

      expect(res.statusCode).toBe(201);
      const payload = JSON.parse(res.body);
      expect(payload.slug).toBe("higienizacao");
    });

    it("DELETE /api/gasto-categorias/:id - Deve retornar HTTP 200 ao excluir categoria", async () => {
      vi.spyOn(gastoCategoriaService, "deleteCategoria").mockResolvedValue({ success: true });

      const res = await app.inject({
        method: "DELETE",
        url: `/api/gasto-categorias/${CAT_CUSTOM_ID}`,
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.success).toBe(true);
    });
  });
});
