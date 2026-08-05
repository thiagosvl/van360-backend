import { describe, it, expect, vi, beforeEach } from "vitest";
import { prePassageiroService } from "../src/services/pre-passageiro.service.js";
import { prePassageiroRepository } from "../src/repositories/pre-passageiro.repository.js";
import { passageiroService } from "../src/services/passageiro.service.js";
import { passageiroRepository } from "../src/repositories/passageiro.repository.js";
import { userRepository } from "../src/repositories/user.repository.js";
import { subscriptionService } from "../src/services/subscriptions/subscription.service.js";
import { subscriptionBillingService } from "../src/services/subscriptions/subscription-billing.service.js";
import { subscriptionRepository } from "../src/repositories/subscription.repository.js";
import { planRepository } from "../src/repositories/plan.repository.js";
import { invoiceRepository } from "../src/repositories/invoice.repository.js";
import { referralRepository } from "../src/repositories/referral.repository.js";
import { paymentMethodRepository } from "../src/repositories/payment-method.repository.js";
import { paymentService } from "../src/services/payments/payment.service.js";
import * as authService from "../src/services/auth.service.js";
import { authRepository } from "../src/repositories/auth.repository.js";
import { authProvider } from "../src/services/providers/auth.provider.js";
import { loginAttemptsRepository } from "../src/repositories/login-attempts.repository.js";
import { historicoService } from "../src/services/historico.service.js";
import { notificationService } from "../src/services/notifications/notification.service.js";
import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  SubscriptionInvoiceStatus,
  CheckoutPaymentMethod,
  ConfigKey,
  PeriodoEnum,
  PassageiroGenero,
  PassageiroModalidade,
  ParentescoResponsavel,
} from "../src/types/enums.js";
import { AppError } from "../src/errors/AppError.js";
import { CreatePrePassageiroDTO } from "../src/types/dtos/pre-passageiro.dto.js";
import { CreateInvoiceDTO } from "../src/types/dtos/subscription.dto.js";
import * as configuracaoService from "../src/services/configuracao.service.js";

const DRIVER_ID = "11111111-1111-4111-8111-111111111111";
const PARENT_DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const PRE_PASSAGEIRO_ID = "33333333-3333-4333-8333-333333333333";
const PASSAGEIRO_ID = "44444444-4444-4444-8444-444444444444";
const ESCOLA_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID_MONTHLY = "66666666-6666-4666-8666-666666666666";
const PLAN_ID_YEARLY = "77777777-7777-4777-8777-777777777777";
const SUB_ID = "88888888-8888-4888-8888-888888888888";
const INVOICE_ID = "99999999-9999-4999-8999-999999999999";
const RECOVERY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Suíte de Testes Avançados - Pre-Passageiro, Subscription SaaS e Auth Token Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(historicoService, "log").mockResolvedValue();
    vi.spyOn(historicoService, "bulkLog").mockResolvedValue();
    vi.spyOn(notificationService, "notifyDriver").mockResolvedValue(true);
    vi.spyOn(notificationService, "notifyAdmin").mockResolvedValue();
  });

  describe("1. Conversão e Ciclo de Vida do Pré-Passageiro (pre-passageiro.service.ts)", () => {
    it("Deve criar pré-cadastro sanitizando strings, formato de moeda e vinculando à conta pai quando existente", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        data: { id: DRIVER_ID, conta_pai_id: PARENT_DRIVER_ID } as never,
        error: null,
      });

      const insertSpy = vi.spyOn(prePassageiroRepository, "insert").mockResolvedValue({
        id: PRE_PASSAGEIRO_ID,
        usuario_id: PARENT_DRIVER_ID,
        nome: "Enzo Gabriel",
        nome_responsavel: "Juliana Santos",
        valor_cobranca: 350.5,
        dia_vencimento: 10,
      } as never);

      const payload: CreatePrePassageiroDTO = {
        usuario_id: DRIVER_ID,
        nome: "   Enzo   Gabriel   ",
        nome_responsavel: "   Juliana   Santos   ",
        cpf_responsavel: "123.456.789-00",
        telefone_responsavel: "(11) 98888-7777",
        escola_id: ESCOLA_ID,
        periodo: PeriodoEnum.MANHA,
        valor_cobranca: "R$ 350,50",
        dia_vencimento: 10,
        logradouro: "Rua das Flores",
        numero: "123",
        bairro: "Centro",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01234-567",
        modalidade: PassageiroModalidade.IDA_VOLTA,
        genero: PassageiroGenero.MASCULINO,
        parentesco_responsavel: ParentescoResponsavel.MAE,
      };

      const result = await prePassageiroService.createPrePassageiro(payload);

      expect(insertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: PARENT_DRIVER_ID,
          nome: "Enzo Gabriel",
          nome_responsavel: "Juliana Santos",
          cpf_responsavel: "12345678900",
          telefone_responsavel: "11988887777",
          valor_cobranca: 350.5,
          dia_vencimento: 10,
        })
      );
      expect(result.id).toBe(PRE_PASSAGEIRO_ID);
    });

    it("Deve aprovar pré-cadastro convertendo pre_passageiro em passageiro definitivo com herança total de atributos", async () => {
      const mockPrePassageiro = {
        id: PRE_PASSAGEIRO_ID,
        usuario_id: DRIVER_ID,
        nome: "Lucas Silva",
        nome_responsavel: "Roberto Silva",
        cpf_responsavel: "98765432100",
        telefone_responsavel: "11977776666",
        escola_id: ESCOLA_ID,
        periodo: PeriodoEnum.TARDE,
        valor_cobranca: 400,
        dia_vencimento: 15,
        logradouro: "Av Paulista",
        numero: "1000",
        bairro: "Bela Vista",
        cidade: "São Paulo",
        estado: "SP",
        cep: "01310100",
        modalidade: PassageiroModalidade.IDA_VOLTA,
        genero: PassageiroGenero.MASCULINO,
        parentesco_responsavel: ParentescoResponsavel.PAI,
      };

      vi.spyOn(prePassageiroRepository, "getById").mockResolvedValue({
        data: mockPrePassageiro as never,
        error: null,
      } as never);

      const passageiroInsertSpy = vi.spyOn(passageiroRepository, "insert").mockResolvedValue({
        data: {
          ...mockPrePassageiro,
          id: PASSAGEIRO_ID,
          ativo: true,
        } as never,
        error: null,
      });

      const deletePreSpy = vi.spyOn(prePassageiroRepository, "delete").mockResolvedValue(true);

      const passageiroCriado = await passageiroService.createPassageiro({
        usuario_id: mockPrePassageiro.usuario_id,
        nome: mockPrePassageiro.nome,
        nome_responsavel: mockPrePassageiro.nome_responsavel,
        cpf_responsavel: mockPrePassageiro.cpf_responsavel,
        telefone_responsavel: mockPrePassageiro.telefone_responsavel,
        escola_id: mockPrePassageiro.escola_id,
        periodo: mockPrePassageiro.periodo,
        valor_cobranca: mockPrePassageiro.valor_cobranca,
        dia_vencimento: mockPrePassageiro.dia_vencimento,
        logradouro: mockPrePassageiro.logradouro,
        bairro: mockPrePassageiro.bairro,
        cidade: mockPrePassageiro.cidade,
        modalidade: mockPrePassageiro.modalidade,
        genero: mockPrePassageiro.genero,
        parentesco_responsavel: mockPrePassageiro.parentesco_responsavel,
      }, true);

      await prePassageiroService.deletePrePassageiro(PRE_PASSAGEIRO_ID);

      expect(passageiroInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          usuario_id: DRIVER_ID,
          nome: "Lucas Silva",
          nome_responsavel: "Roberto Silva",
          cpf_responsavel: "98765432100",
          telefone_responsavel: "11977776666",
          escola_id: ESCOLA_ID,
          logradouro: "Av Paulista",
          cidade: "São Paulo",
          parentesco_responsavel: ParentescoResponsavel.PAI,
        })
      );
      expect(deletePreSpy).toHaveBeenCalledWith(PRE_PASSAGEIRO_ID);
      expect(passageiroCriado.id).toBe(PASSAGEIRO_ID);
    });

    it("Deve rejeitar pré-cadastro excluindo o registro sem instanciar novo passageiro", async () => {
      const deletePreSpy = vi.spyOn(prePassageiroRepository, "delete").mockResolvedValue(true);
      const passageiroInsertSpy = vi.spyOn(passageiroRepository, "insert");

      const success = await prePassageiroService.deletePrePassageiro(PRE_PASSAGEIRO_ID);

      expect(success).toBe(true);
      expect(deletePreSpy).toHaveBeenCalledWith(PRE_PASSAGEIRO_ID);
      expect(passageiroInsertSpy).not.toHaveBeenCalled();
    });

    it("Deve tratar erros de exclusão de pré-cadastro lançando exceção formatada", async () => {
      vi.spyOn(prePassageiroRepository, "delete").mockRejectedValue(new Error("Erro DB de FK constraint"));

      await expect(prePassageiroService.deletePrePassageiro(PRE_PASSAGEIRO_ID)).rejects.toThrow(
        "Falha ao excluir o pré-cadastro: Erro DB de FK constraint"
      );
    });
  });

  describe("2. Ciclo de Faturas SaaS, Renovação e Upgrade de Plano (subscription.service.ts)", () => {
    it("Deve calcular preço base, aplicar promoção ativa e aplicar desconto de indicação pro-rata", async () => {
      const mockSub = {
        id: SUB_ID,
        usuario_id: DRIVER_ID,
        status: SubscriptionStatus.TRIAL,
        valor_base_mensal: 120,
        valor_promocional_mensal: 99.9,
      };

      vi.spyOn(planRepository, "getByIdentifier").mockImplementation(async (id: string) => {
        if (id === SubscriptionIdentifer.MONTHLY) {
          return { data: { id: PLAN_ID_MONTHLY, identificador: SubscriptionIdentifer.MONTHLY, valor: 150, valor_promocional: 100 } as never, error: null };
        }
        return { data: { id: PLAN_ID_YEARLY, identificador: SubscriptionIdentifer.YEARLY, valor: 1200, valor_promocional: 900 } as never, error: null };
      });

      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue(mockSub as never);
      vi.spyOn(configuracaoService, "getConfig").mockResolvedValue("true");
      vi.spyOn(configuracaoService, "getConfigNumber").mockResolvedValue(10);
      vi.spyOn(referralRepository, "getPendingReferralByIndicadoId").mockResolvedValue({
        data: { id: "ref-123" } as never,
        error: null,
      });

      const precoCalculado = await subscriptionBillingService.calculatePrice(DRIVER_ID, SubscriptionIdentifer.MONTHLY);

      expect(precoCalculado).toBe(89.91);
    });

    it("Deve gerar fatura de cobrança Pix cancelando faturas pendentes anteriores", async () => {
      vi.spyOn(userRepository, "getById").mockResolvedValue({
        data: { id: DRIVER_ID, nome: "Motorista Teste", email: "motorista@test.com", cpfcnpj: "12345678901", telefone: "11999998888" } as never,
        error: null,
      });

      vi.spyOn(planRepository, "getById").mockResolvedValue({
        data: { id: PLAN_ID_MONTHLY, nome: "Plano Pro Mensal", identificador: SubscriptionIdentifer.MONTHLY, valor: 120 } as never,
        error: null,
      });

      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue({
        id: SUB_ID,
        usuario_id: DRIVER_ID,
        metodo_pagamento_preferencial_id: null,
      } as never);

      vi.spyOn(subscriptionBillingService, "calculatePrice").mockResolvedValue(120);
      vi.spyOn(subscriptionRepository, "updatePaymentMethod").mockResolvedValue({ data: null, error: null } as never);

      vi.spyOn(paymentService, "createCharge").mockResolvedValue({
        success: true,
        providerId: "txid_pix_12345",
        pixCopyPaste: "00020126580014br.gov.bcb.pix...",
      });

      const cancelIncompleteSpy = vi.spyOn(invoiceRepository, "cancelIncompleteInvoicesByUserId").mockResolvedValue({ data: null, error: null } as never);

      const createInvoiceSpy = vi.spyOn(invoiceRepository, "createInvoice").mockResolvedValue({
        data: {
          id: INVOICE_ID,
          usuario_id: DRIVER_ID,
          assinatura_id: SUB_ID,
          plano_id: PLAN_ID_MONTHLY,
          metodo_pagamento: CheckoutPaymentMethod.PIX,
          valor: 120,
          status: SubscriptionInvoiceStatus.PENDING,
          gateway_txid: "txid_pix_12345",
        } as never,
        error: null,
      });

      const request: CreateInvoiceDTO = {
        planId: PLAN_ID_MONTHLY,
        paymentMethod: CheckoutPaymentMethod.PIX,
      };

      const fatura = await subscriptionBillingService.createInvoice(DRIVER_ID, request);

      expect(createInvoiceSpy).toHaveBeenCalled();
      expect(cancelIncompleteSpy).toHaveBeenCalledWith(DRIVER_ID, expect.any(String), INVOICE_ID);
      expect(fatura.id).toBe(INVOICE_ID);
    });

    it("Deve confirmar pagamento de assinatura SaaS via webhook ativando plano e registrando auditoria", async () => {
      const confirmRpcSpy = vi.spyOn(subscriptionRepository, "confirmInvoicePaymentRpc").mockResolvedValue({
        data: {
          success: true,
          fatura_id: INVOICE_ID,
          assinatura_id: SUB_ID,
          usuario_id: DRIVER_ID,
          valor: 120,
          plano_nome: "Plano Pro Mensal",
          new_expiry: "2026-09-05T00:00:00.000Z",
          usuario_nome: "Motorista Teste",
          usuario_telefone: "11999998888",
        },
        error: null,
      });

      await subscriptionService.activateByFatura(INVOICE_ID);

      expect(confirmRpcSpy).toHaveBeenCalledWith(INVOICE_ID);
      expect(historicoService.bulkLog).toHaveBeenCalledWith([
        expect.objectContaining({
          entidade_tipo: "SAAS_FATURA",
          acao: "SAAS_PAGAMENTO_RECEBIDO",
        }),
        expect.objectContaining({
          entidade_tipo: "SAAS_ASSINATURA",
          acao: "SAAS_ASSINATURA_ATIVA",
        }),
      ]);
    });

    it("Deve ignorar webhook com retorno de falha ou idempotência sem lançar exceção", async () => {
      vi.spyOn(subscriptionRepository, "confirmInvoicePaymentRpc").mockResolvedValue({
        data: { success: false, message: "Fatura já processada previamente" },
        error: null,
      });

      await expect(subscriptionService.activateByFatura(INVOICE_ID)).resolves.toBeUndefined();
      expect(historicoService.bulkLog).not.toHaveBeenCalled();
    });

    it("Deve realizar cancelamento de assinatura suspendendo cobranças e bloqueando acesso", async () => {
      const mockSub = {
        id: SUB_ID,
        usuario_id: DRIVER_ID,
        status: SubscriptionStatus.ACTIVE,
      };

      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue(mockSub as never);
      vi.spyOn(subscriptionService, "updateStatus").mockResolvedValue(true);
      vi.spyOn(invoiceRepository, "cancelIncompleteInvoicesByUserId").mockResolvedValue({ data: null, error: null } as never);

      const cancelRes = await subscriptionService.cancelSubscription(DRIVER_ID);
      expect(cancelRes).toBe(true);

      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue({
        ...mockSub,
        status: SubscriptionStatus.CANCELED,
      } as never);

      const isBlocked = await subscriptionService.isBlocked(DRIVER_ID);
      expect(isBlocked).toBe(true);
    });
  });

  describe("3. Rotação de Tokens de Auth, Recuperação de Senha e Segurança (auth.service.ts)", () => {
    it("Deve solicitar código de recuperação via WhatsApp gerando OTP e aplicando cooldown de 1 minuto", async () => {
      vi.spyOn(authRepository, "getUserIdAndEmailByCpf").mockResolvedValue({
        data: {
          id: DRIVER_ID,
          email: "motorista@test.com",
          nome: "Carlos Eduardo",
          telefone: "11988884444",
        } as never,
        error: null,
      });

      vi.spyOn(authRepository, "getLatestActiveRecoveryCode").mockResolvedValue({
        data: null,
        error: null,
      });

      vi.spyOn(authRepository, "invalidateRecoveryCodes").mockResolvedValue({ data: null, error: null } as never);
      vi.spyOn(authRepository, "insertRecoveryCode").mockResolvedValue({ data: null, error: null } as never);

      const result = await authService.solicitarRecuperacaoWhatsapp("12345678901");
      expect(result.telefoneMascarado).toBe("(XX) XXXXX-4444");

      vi.spyOn(authRepository, "getLatestActiveRecoveryCode").mockResolvedValue({
        data: { created_at: new Date().toISOString() } as never,
        error: null,
      });

      await expect(authService.solicitarRecuperacaoWhatsapp("12345678901")).rejects.toThrow(
        "Aguarde pelo menos 1 minuto para solicitar um novo código."
      );
    });

    it("Deve validar código de recuperação do WhatsApp marcando como usado e rejeitar reutilização", async () => {
      vi.spyOn(authRepository, "getUserIdAndEmailByCpf").mockResolvedValue({
        data: { id: DRIVER_ID, email: "carlos@test.com" } as never,
        error: null,
      });

      vi.spyOn(authRepository, "getRecoveryCode").mockResolvedValue({
        data: { id: RECOVERY_ID, usado: false, expira_em: new Date(Date.now() + 600000).toISOString() } as never,
        error: null,
      });

      const markUsedSpy = vi.spyOn(authRepository, "markRecoveryCodeUsed").mockResolvedValue({ data: null, error: null } as never);

      const valResult = await authService.validarCodigoWhatsApp("12345678901", "123456");
      expect(valResult.recoveryId).toBe(RECOVERY_ID);
      expect(markUsedSpy).toHaveBeenCalledWith(RECOVERY_ID);

      vi.spyOn(authRepository, "getRecoveryCode").mockResolvedValue({
        data: { id: RECOVERY_ID, usado: true, expira_em: new Date(Date.now() + 600000).toISOString() } as never,
        error: null,
      });

      await expect(authService.validarCodigoWhatsApp("12345678901", "123456")).rejects.toThrow(
        "Código inválido ou expirado."
      );
    });

    it("Deve redefinir a senha com código de recuperação e efetuar login automático com sessão de token nova", async () => {
      vi.spyOn(authRepository, "getRecoverySession").mockResolvedValue({
        data: {
          usuario_id: DRIVER_ID,
          created_at: new Date().toISOString(),
          usado: true,
          usuarios: {
            email: "carlos@test.com",
            nome: "Carlos Eduardo",
            telefone: "11988884444",
          },
        } as never,
        error: null,
      });

      const updateAuthSpy = vi.spyOn(authProvider, "updateUserById").mockResolvedValue({ data: {} as never, error: null });
      vi.spyOn(authProvider, "signInWithPassword").mockResolvedValue({
        data: {
          session: {
            access_token: "new_access_token_abc",
            refresh_token: "new_refresh_token_xyz",
          },
          user: { id: DRIVER_ID },
        } as never,
        error: null,
      });

      const session = await authService.resetarSenhaComCodigo(RECOVERY_ID, "NovaSenha123!");

      expect(updateAuthSpy).toHaveBeenCalledWith(DRIVER_ID, { password: "NovaSenha123!" });
      expect(session.access_token).toBe("new_access_token_abc");
      expect(session.refresh_token).toBe("new_refresh_token_xyz");
    });

    it("Deve validar unicidade de cadastro (CPF, e-mail, telefone) e impedir auto-indicação", async () => {
      vi.spyOn(authRepository, "checkUserStatus").mockResolvedValue({
        data: [{ id: "existing-user", cpfcnpj: "12345678901", email: "outro@test.com", telefone: "11900000000" }] as never,
        error: null,
      });

      const checkRes = await authService.checkUserStatus("12345678901", "novo@test.com", "11911111111");
      expect(checkRes.action).toBe("bloqueado_em_uso");
      expect(checkRes.field).toBe("cpfcnpj");

      vi.spyOn(authRepository, "checkUserStatus").mockResolvedValue({ data: [] as never, error: null });
      vi.spyOn(userRepository, "getByPhone").mockResolvedValue({
        data: { id: DRIVER_ID } as never,
        error: null,
      });

      await expect(
        authService.registrarUsuario({
          nome: "Teste Auto",
          email: "auto@test.com",
          senha: "Senha123!",
          cpfcnpj: "99988877766",
          telefone: "11988887777",
          indicador_telefone: "11988887777",
          termos_aceitos: true,
        })
      ).rejects.toThrow("Você não pode utilizar seu próprio WhatsApp como indicação.");
    });

    it("Deve auditar tentativas de login com sucesso e falha via loginAttemptsRepository", async () => {
      const logAttemptSpy = vi.spyOn(loginAttemptsRepository, "logAttempt").mockResolvedValue({ data: null, error: null } as never);

      vi.spyOn(authRepository, "getUserLogin").mockResolvedValue({
        data: { id: DRIVER_ID, email: "login@test.com", ativo: true } as never,
        error: null,
      });

      vi.spyOn(authProvider, "signInWithPassword").mockResolvedValue({
        data: {
          session: { access_token: "tok1", refresh_token: "tok2" },
          user: { id: DRIVER_ID },
        } as never,
        error: null,
      });

      await authService.login("12345678901", "SenhaCorreta", {
        ip: "200.200.200.200",
        userAgent: "JestTest",
        dispositivo: "WEB",
      });

      expect(logAttemptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          login_tentado: "12345678901",
          sucesso: true,
          motivo_falha: null,
        })
      );

      vi.spyOn(authProvider, "signInWithPassword").mockResolvedValue({
        data: { session: null, user: null } as never,
        error: new AppError("Credenciais inválidas.", 401) as never,
      });

      await expect(
        authService.login("12345678901", "SenhaErrada", {
          ip: "200.200.200.200",
          userAgent: "JestTest",
          dispositivo: "WEB",
        })
      ).rejects.toThrow();

      expect(logAttemptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          login_tentado: "12345678901",
          sucesso: false,
        })
      );
    });
  });
});
