import { describe, it, expect, vi, beforeEach } from "vitest";
import { TipoChavePix, AtividadeAcao, UserType } from "../src/types/enums.js";
import { isValidPixKey, isValidCPF, isValidCNPJ } from "../src/utils/validators.js";
import { atualizarPixUsuario } from "../src/services/usuario.service.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { historicoService } from "../src/services/historico.service.js";
import { AppError } from "../src/errors/AppError.js";
import { createApp } from "../src/app.js";

const TEST_USER_ID = "00000000-0000-0000-0000-000000000001";

vi.mock("../src/middleware/auth.js", () => ({
  authenticate: async (request: any) => {
    request.user = { id: TEST_USER_ID, app_metadata: { role: UserType.MOTORISTA } };
    request.profile = { id: TEST_USER_ID, tipo: UserType.MOTORISTA };
    request.usuario_id = TEST_USER_ID;
  },
  verifySupabaseJWT: async (request: any, reply: any) => {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return reply.status(401).send({ error: "Token não fornecido." });
    }
    request.user = { id: TEST_USER_ID, app_metadata: { role: UserType.MOTORISTA } };
    request.profile = { id: TEST_USER_ID, tipo: UserType.MOTORISTA };
    request.usuario_id = TEST_USER_ID;
  },
}));

vi.mock("../src/middleware/subscription.js", () => ({
  checkSubscriptionAccess: async () => {},
}));

describe("Suíte de Testes - Validação e Atualização de Chaves PIX do Gestor", () => {
  let app: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await createApp();
  });

  describe("1. Validação de Formatos de Chave PIX (CPF, CNPJ, E-mail, Telefone, EVP)", () => {
    describe("Chave PIX do Tipo CPF", () => {
      it("Deve aprovar CPFs válidos", () => {
        // CPFs válidos conhecidos pelos algoritmos de dígito verificador
        const validCpfs = ["52998224725", "11144477735"];
        for (const cpf of validCpfs) {
          expect(isValidCPF(cpf)).toBe(true);
          expect(isValidPixKey(TipoChavePix.CPF, cpf)).toBe(true);
        }
      });

      it("Deve rejeitar CPFs inválidos (dígitos verificadores incorretos ou repetidos)", () => {
        const invalidCpfs = ["11111111111", "00000000000", "12345678900", "12345"];
        for (const cpf of invalidCpfs) {
          expect(isValidCPF(cpf)).toBe(false);
          expect(isValidPixKey(TipoChavePix.CPF, cpf)).toBe(false);
        }
      });
    });

    describe("Chave PIX do Tipo CNPJ", () => {
      it("Deve aprovar CNPJs válidos", () => {
        const validCnpjs = ["11222333000181", "11.222.333/0001-81"];
        for (const cnpj of validCnpjs) {
          expect(isValidCNPJ(cnpj)).toBe(true);
          expect(isValidPixKey(TipoChavePix.CNPJ, cnpj)).toBe(true);
        }
      });

      it("Deve rejeitar CNPJs inválidos", () => {
        const invalidCnpjs = ["00000000000000", "11111111111111", "12345678000100"];
        for (const cnpj of invalidCnpjs) {
          expect(isValidCNPJ(cnpj)).toBe(false);
          expect(isValidPixKey(TipoChavePix.CNPJ, cnpj)).toBe(false);
        }
      });
    });

    describe("Chave PIX do Tipo E-mail", () => {
      it("Deve aprovar e-mails em sintaxe válida", () => {
        const validEmails = ["frotista@van360.com.br", "financeiro.vans@empresa.com"];
        for (const email of validEmails) {
          expect(isValidPixKey(TipoChavePix.EMAIL, email)).toBe(true);
        }
      });

      it("Deve rejeitar e-mails sem arroba ou domínio inválido", () => {
        const invalidEmails = ["frotistavan360.com", "financeiro@", "@empresa.com", ""];
        for (const email of invalidEmails) {
          expect(isValidPixKey(TipoChavePix.EMAIL, email)).toBe(false);
        }
      });
    });

    describe("Chave PIX do Tipo Telefone", () => {
      it("Deve aprovar telefones válidos de 11 dígitos com DDD", () => {
        const validPhones = ["11999998888", "(11) 98888-7777"];
        for (const phone of validPhones) {
          expect(isValidPixKey(TipoChavePix.TELEFONE, phone)).toBe(true);
        }
      });

      it("Deve rejeitar telefones com menos ou mais de 11 dígitos", () => {
        const invalidPhones = ["1199998888", "123456", "11999998888777"];
        for (const phone of invalidPhones) {
          expect(isValidPixKey(TipoChavePix.TELEFONE, phone)).toBe(false);
        }
      });
    });

    describe("Chave PIX do Tipo Aleatória (EVP)", () => {
      it("Deve aprovar chaves aleatórias EVP de 32 caracteres alfanuméricos", () => {
        const validEvp = "123e4567e89b12d3a456426614174000";
        expect(isValidPixKey(TipoChavePix.ALEATORIA, validEvp)).toBe(true);
      });

      it("Deve rejeitar chaves aleatórias com tamanho diferente de 32 caracteres", () => {
        const invalidEvps = ["123e4567", "curta", "123e4567e89b12d3a456426614174000999"];
        for (const evp of invalidEvps) {
          expect(isValidPixKey(TipoChavePix.ALEATORIA, evp)).toBe(false);
        }
      });
    });
  });

  describe("2. Serviço de Atualização de Chave PIX do Usuário", () => {
    it("Deve rejeitar atualização se apenas um dos dois parâmetros (chave ou tipo) for enviado", async () => {
      await expect(
        atualizarPixUsuario(TEST_USER_ID, {
          chave_pix: "frotista@van360.com.br",
          tipo_chave_pix: null,
        })
      ).rejects.toThrow(AppError);

      await expect(
        atualizarPixUsuario(TEST_USER_ID, {
          chave_pix: null,
          tipo_chave_pix: TipoChavePix.EMAIL,
        })
      ).rejects.toThrow(AppError);
    });

    it("Deve rejeitar se a chave PIX for incompatível com o tipo selecionado", async () => {
      vi.spyOn(userRepository, "getPixKey").mockResolvedValue({
        data: { chave_pix: null, tipo_chave_pix: null },
      } as any);

      await expect(
        atualizarPixUsuario(TEST_USER_ID, {
          chave_pix: "email_invalido_como_cpf",
          tipo_chave_pix: TipoChavePix.CPF,
        })
      ).rejects.toThrow("Formato de chave Pix inválido");
    });

    it("Deve atualizar com sucesso e registrar log de auditoria ao passar uma chave válida", async () => {
      vi.spyOn(userRepository, "getPixKey").mockResolvedValue({
        data: { chave_pix: null, tipo_chave_pix: null },
      } as any);

      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);
      const logSpy = vi.spyOn(historicoService, "log").mockResolvedValue();

      const res = await atualizarPixUsuario(TEST_USER_ID, {
        chave_pix: "gestor@van360.com.br",
        tipo_chave_pix: TipoChavePix.EMAIL,
      });

      expect(res.success).toBe(true);
      expect(userRepository.update).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          chave_pix: "gestor@van360.com.br",
          tipo_chave_pix: TipoChavePix.EMAIL,
        })
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: TEST_USER_ID,
          acao: AtividadeAcao.CHAVE_PIX_ALTERADA,
        })
      );
    });

    it("Deve permitir a remoção da chave PIX definindo ambos os campos como nulos", async () => {
      vi.spyOn(userRepository, "getPixKey").mockResolvedValue({
        data: { chave_pix: "gestor@van360.com.br", tipo_chave_pix: TipoChavePix.EMAIL },
      } as any);

      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);
      const logSpy = vi.spyOn(historicoService, "log").mockResolvedValue();

      const res = await atualizarPixUsuario(TEST_USER_ID, {
        chave_pix: null,
        tipo_chave_pix: null,
      });

      expect(res.success).toBe(true);
      expect(userRepository.update).toHaveBeenCalledWith(
        TEST_USER_ID,
        expect.objectContaining({
          chave_pix: null,
          tipo_chave_pix: null,
        })
      );
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          descricao: "Chave Pix de recebimento estática removida pelo motorista.",
        })
      );
    });
  });

  describe("3. Endpoint HTTP Fastify (PATCH /api/usuarios/:id/pix)", () => {
    it("PATCH /api/usuarios/:id/pix - Deve retornar HTTP 200 ao atualizar chave PIX válida", async () => {
      vi.spyOn(userRepository, "getPixKey").mockResolvedValue({ data: { chave_pix: null } } as any);
      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);

      const res = await app.inject({
        method: "PATCH",
        url: `/api/usuarios/${TEST_USER_ID}/pix`,
        headers: { authorization: "Bearer token_valido" },
        payload: {
          chave_pix: "11999998888",
          tipo_chave_pix: TipoChavePix.TELEFONE,
        },
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.success).toBe(true);
    });

    it("PATCH /api/usuarios/:id/pix - Deve retornar HTTP 400 ao enviar chave PIX com formato inválido", async () => {
      const res = await app.inject({
        method: "PATCH",
        url: `/api/usuarios/${TEST_USER_ID}/pix`,
        headers: { authorization: "Bearer token_valido" },
        payload: {
          chave_pix: "telefone_curto_123",
          tipo_chave_pix: TipoChavePix.TELEFONE,
        },
      });

      expect(res.statusCode).toBe(400);
      const payload = JSON.parse(res.body);
      expect(payload.error).toBe("Formato de chave Pix inválido para o tipo selecionado.");
    });
  });
});
