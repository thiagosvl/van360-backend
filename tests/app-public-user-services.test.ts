import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkAppUpdates, checkAppVersion, registerPushToken, registerDevice } from "../src/services/app.service.js";
import { getCarteirinhaPublica, validateMotoristaPublic, listEscolasPublic } from "../src/services/public.service.js";
import { atualizarUsuario, uploadAvatar, alterarTelefoneUsuario } from "../src/services/usuario.service.js";
import { appRepository, AppUpdateRecord } from "../src/repositories/app.repository.js";
import { passageiroRepository } from "../src/repositories/passageiro.repository.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { escolaRepository } from "../src/repositories/escola.repository.js";
import { historicoService } from "../src/services/historico.service.js";
import { AppError } from "../src/errors/AppError.js";

describe("Suíte de Testes Automatizados - Serviços App Mobile, Carteirinha Pública e Perfil de Usuário", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. App Mobile Service (app.service.ts)", () => {
    const mockUpdates: AppUpdateRecord[] = [
      {
        id: "update-v2",
        platform: "android",
        latest_version: "2.0.0",
        force_update: false,
        url_zip: "https://cdn.van360.com/v2.0.0.zip",
        changelog: "Novas funcionalidades de rotas",
        created_at: "2026-08-01T10:00:00Z",
      },
      {
        id: "update-v1-5",
        platform: "android",
        latest_version: "1.5.0",
        force_update: true,
        url_zip: "https://cdn.van360.com/v1.5.0.zip",
        changelog: "Atualização crítica de segurança",
        created_at: "2026-07-15T10:00:00Z",
      },
      {
        id: "update-v1-0",
        platform: "android",
        latest_version: "1.0.0",
        force_update: false,
        url_zip: "https://cdn.van360.com/v1.0.0.zip",
        changelog: "Versão inicial",
        created_at: "2026-06-01T10:00:00Z",
      },
    ];

    it("Deve retornar null quando não houver atualizações cadastradas para a plataforma", async () => {
      vi.spyOn(appRepository, "getUpdatesForPlatform").mockResolvedValue([]);

      const result = await checkAppUpdates("ios");
      expect(result).toBeNull();
    });

    it("Deve retornar a versão mais recente caso a versão atual do app não seja informada", async () => {
      vi.spyOn(appRepository, "getUpdatesForPlatform").mockResolvedValue(mockUpdates);

      const result = await checkAppVersion("android");
      expect(result).not.toBeNull();
      expect(result?.latest_version).toBe("2.0.0");
      expect(result?.force_update).toBe(false);
    });

    it("Deve marcar force_update como true se o usuário pular uma versão com atualização forçada obrigatória", async () => {
      vi.spyOn(appRepository, "getUpdatesForPlatform").mockResolvedValue(mockUpdates);

      const result = await checkAppUpdates("android", "1.0.0");
      expect(result).not.toBeNull();
      expect(result?.latest_version).toBe("2.0.0");
      expect(result?.force_update).toBe(true);
    });

    it("Deve manter force_update como false se o usuário já estiver em uma versão após as atualizações forçadas", async () => {
      vi.spyOn(appRepository, "getUpdatesForPlatform").mockResolvedValue(mockUpdates);

      const result = await checkAppUpdates("android", "1.5.0");
      expect(result).not.toBeNull();
      expect(result?.latest_version).toBe("2.0.0");
      expect(result?.force_update).toBe(false);
    });

    it("Deve registrar token de notificação push com sucesso", async () => {
      vi.spyOn(appRepository, "registerPushToken").mockResolvedValue({ error: null } as any);

      const res = await registerPushToken("usr-123", "ExponentPushToken[xyz123]", "android");
      expect(res).toEqual({ success: true });
      expect(appRepository.registerPushToken).toHaveBeenCalledWith("usr-123", "ExponentPushToken[xyz123]", "android");
    });

    it("Deve rejeitar registro de token push quando usuarioId ou pushToken forem omitidos", async () => {
      await expect(registerPushToken("", "ExponentPushToken[xyz]")).rejects.toThrow(AppError);
      await expect(registerPushToken("usr-123", "")).rejects.toThrow(AppError);
    });

    it("Deve lançar AppError se houver falha no banco de dados ao salvar o token push", async () => {
      vi.spyOn(appRepository, "registerPushToken").mockResolvedValue({ error: { message: "DB Error" } } as any);

      await expect(registerPushToken("usr-123", "ExponentPushToken[xyz]")).rejects.toThrow("Erro ao registrar token de notificação push: DB Error");
    });

    it("Deve registrar dispositivo móvel com sucesso", async () => {
      vi.spyOn(appRepository, "registerDevice").mockResolvedValue({ error: null } as any);

      const deviceData = {
        device_id: "dev-uuid-999",
        platform: "ios",
        model: "iPhone 15 Pro",
        app_version: "2.0.0",
      };

      const res = await registerDevice("usr-123", deviceData);
      expect(res).toEqual({ success: true });
      expect(appRepository.registerDevice).toHaveBeenCalledWith("usr-123", deviceData);
    });

    it("Deve rejeitar registro de dispositivo com dados incompletos", async () => {
      await expect(registerDevice("", { device_id: "dev-1", platform: "ios" })).rejects.toThrow(AppError);
      await expect(registerDevice("usr-123", { device_id: "", platform: "ios" })).rejects.toThrow(AppError);
      await expect(registerDevice("usr-123", { device_id: "dev-1", platform: "" })).rejects.toThrow(AppError);
    });
  });

  describe("2. Carteirinha Pública Service (public.service.ts)", () => {
    const mockPassageiroCompleto = {
      id: "pas-11111111-2222-3333-4444-555555555555",
      nome: "Gabriel Souza",
      ativo: true,
      periodo: "manha",
      modalidade: "ida_volta",
      nome_responsavel: "Mariana Souza",
      telefone_responsavel: "11988887777",
      foto_url: "https://storage.van360.com/foto-gabriel.jpg",
      escola: { id: "esc-1", nome: "Colégio Santa Maria" },
      veiculo: { id: "vei-1", placa: "ABC-1234", modelo: "Mercedes Sprinter" },
    };

    it("Deve retornar dados formatados da carteirinha pública com status VALIDA", async () => {
      vi.spyOn(passageiroRepository, "getById").mockResolvedValue({ data: mockPassageiroCompleto, error: null } as any);

      const carteirinha = await getCarteirinhaPublica("pas-11111111-2222-3333-4444-555555555555");

      expect(carteirinha.id).toBe(mockPassageiroCompleto.id);
      expect(carteirinha.nome).toBe("Gabriel Souza");
      expect(carteirinha.status).toBe("VALIDA");
      expect(carteirinha.codigo_validacao).toBe("CARD-PAS-1111");
      expect(carteirinha.escola?.nome).toBe("Colégio Santa Maria");
      expect(carteirinha.veiculo?.placa).toBe("ABC-1234");
    });

    it("Deve rejeitar consulta com AppError 404 quando o passageiro não for encontrado", async () => {
      vi.spyOn(passageiroRepository, "getById").mockResolvedValue({ data: null, error: true } as any);

      await expect(getCarteirinhaPublica("pas-inexistente")).rejects.toThrow(AppError);
      await expect(getCarteirinhaPublica("pas-inexistente")).rejects.toThrow("Carteirinha pública do passageiro não encontrada.");
    });

    it("Deve rejeitar consulta com AppError 403 quando a carteirinha/passageiro estiver inativo", async () => {
      vi.spyOn(passageiroRepository, "getById").mockResolvedValue({
        data: { ...mockPassageiroCompleto, ativo: false },
        error: null,
      } as any);

      await expect(getCarteirinhaPublica("pas-11111111-2222-3333-4444-555555555555")).rejects.toThrow("Carteirinha inativa ou cancelada.");
    });

    it("Deve rejeitar com AppError 400 se o ID da carteirinha for omitido", async () => {
      await expect(getCarteirinhaPublica("")).rejects.toThrow("ID da carteirinha é obrigatório.");
    });

    it("Deve validar dados públicos de motorista com sucesso", async () => {
      vi.spyOn(userRepository, "getPublicData").mockResolvedValue({
        data: { id: "mot-1", nome: "Carlos Silva", apelido: "Tio Carlos" },
        error: null,
      } as any);

      const motorista = await validateMotoristaPublic("mot-1");
      expect(motorista.nome).toBe("Carlos Silva");
      expect(motorista.apelido).toBe("Tio Carlos");
    });

    it("Deve falhar a validação pública de motorista com 404 se não for encontrado", async () => {
      vi.spyOn(userRepository, "getPublicData").mockResolvedValue({ data: null, error: true } as any);

      await expect(validateMotoristaPublic("mot-invalido")).rejects.toThrow("Motorista não encontrado ou link inválido.");
    });

    it("Deve listar escolas públicas ativas do motorista", async () => {
      const escolasMock = [{ id: "esc-1", nome: "Escola A" }, { id: "esc-2", nome: "Escola B" }];
      vi.spyOn(escolaRepository, "list").mockResolvedValue({ data: escolasMock, error: null } as any);

      const result = await listEscolasPublic("mot-1");
      expect(result).toHaveLength(2);
      expect(result[0].nome).toBe("Escola A");
    });
  });

  describe("3. Perfil de Usuário Service (usuario.service.ts)", () => {
    const usuarioId = "usr-00000000-0000-0000-0000-000000000001";

    it("Deve atualizar perfil com limpeza de strings e registro de auditoria", async () => {
      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);
      vi.spyOn(historicoService, "log").mockImplementation(() => {});

      const payload = {
        nome: "   Carlos   Eduardo   ",
        apelido: "  Tio   Cadu  ",
        data_nascimento: "15/08/1985",
      };

      const result = await atualizarUsuario(usuarioId, payload);
      expect(result).toEqual({ success: true });
      expect(userRepository.update).toHaveBeenCalledWith(
        usuarioId,
        expect.objectContaining({
          nome: "Carlos Eduardo",
          apelido: "Tio Cadu",
          data_nascimento: "1985-08-15",
        })
      );
      expect(historicoService.log).toHaveBeenCalled();
    });

    it("Deve fazer upload/atualização de avatar do usuário com sucesso", async () => {
      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);
      vi.spyOn(historicoService, "log").mockImplementation(() => {});

      const avatarUrl = " https://storage.van360.com/avatars/user-1.png  ";
      const result = await uploadAvatar(usuarioId, avatarUrl);

      expect(result).toEqual({ success: true, avatar_url: "https://storage.van360.com/avatars/user-1.png" });
      expect(userRepository.update).toHaveBeenCalledWith(
        usuarioId,
        expect.objectContaining({
          avatar_url: "https://storage.van360.com/avatars/user-1.png",
        })
      );
    });

    it("Deve rejeitar upload de avatar sem usuarioId ou com URL vazia", async () => {
      await expect(uploadAvatar("", "https://storage.van360.com/avatar.png")).rejects.toThrow("ID do usuário é obrigatório.");
      await expect(uploadAvatar(usuarioId, "   ")).rejects.toThrow("URL do avatar é obrigatória.");
    });

    it("Deve alterar telefone sanitizando formato e caracteres não numéricos", async () => {
      vi.spyOn(userRepository, "update").mockResolvedValue({ error: null } as any);
      vi.spyOn(historicoService, "log").mockImplementation(() => {});

      const telefoneComMascara = "(11) 98765-4321";
      const result = await alterarTelefoneUsuario(usuarioId, telefoneComMascara);

      expect(result).toEqual({ success: true, telefone: "11987654321" });
      expect(userRepository.update).toHaveBeenCalledWith(
        usuarioId,
        expect.objectContaining({
          telefone: "11987654321",
        })
      );
    });

    it("Deve rejeitar alteração de telefone se o número for menor que 10 dígitos", async () => {
      await expect(alterarTelefoneUsuario(usuarioId, "12345")).rejects.toThrow(
        "Número de telefone inválido. Informe DDD e número com 10 ou 11 dígitos."
      );
    });

    it("Deve rejeitar atualização quando usuarioId for omitido", async () => {
      await expect(atualizarUsuario("", { nome: "Teste" })).rejects.toThrow("ID do usuário é obrigatório.");
    });
  });
});
