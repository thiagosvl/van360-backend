import { describe, it, expect, vi, beforeEach } from "vitest";
import { cobrancasNotificacoesJob } from "../src/services/jobs/cobrancas-notificacoes.job.js";
import { assinaturasVencimentoJob } from "../src/services/jobs/assinaturas-vencimento.job.js";
import { limpezaTokensJob } from "../src/services/jobs/limpeza-tokens.job.ts";
import { cobrancaService } from "../src/services/cobranca.service.js";
import { cobrancaRepository } from "../src/repositories/cobranca.repository.js";
import { notificationService } from "../src/services/notifications/notification.service.js";
import { subscriptionService } from "../src/services/subscriptions/subscription.service.js";
import { subscriptionMonitorService } from "../src/services/subscriptions/subscription-monitor.service.js";
import { monitorRepository } from "../src/repositories/monitor.repository.js";
import { authRepository } from "../src/repositories/auth.repository.js";
import { expurgarCodigosRecuperacaoExpirados } from "../src/services/auth.service.js";
import { checkSubscriptionAccess } from "../src/middleware/subscription.js";
import { SubscriptionStatus } from "../src/types/enums.js";
import { getNowBR, toPersistenceString, addDays } from "../src/utils/date.utils.js";
import { env } from "../src/config/env.js";
import { createApp } from "../src/app.js";

describe("Suíte de Testes Automatizados - Jobs, Crons e Filas de Segundo Plano", () => {

  describe("1. Jobs e Rota de Cobranças e Notificações (jobs/cobrancas-notificacoes.job.ts & jobs.route.ts)", () => {
    
    it("Deve identificar cobranças vencendo hoje, com antecedência e em atraso, e disparar notificações WhatsApp sem duplicidade", async () => {
      const now = getNowBR();
      const todayStr = toPersistenceString(now);
      const in3DaysStr = toPersistenceString(addDays(now, 2));
      const overdue3DaysStr = toPersistenceString(addDays(now, -3));

      const mockCobrancas = [
        {
          id: "cob-hoje-1",
          usuario_id: "user-1",
          data_vencimento: todayStr,
          data_envio_ultima_notificacao: null,
          valor: 250,
          mes: 8,
          ano: 2026,
          passageiro: {
            id: "pas-1",
            nome: "Pedro Silva",
            nome_responsavel: "João Silva",
            telefone_responsavel: "11999991111",
            enviar_notificacoes: true
          },
          motorista: {
            id: "user-1",
            nome: "Carlos Motorista",
            telefone: "11988881111",
            chave_pix: "carlos@pix.com",
            tipo_chave_pix: "EMAIL"
          }
        },
        {
          id: "cob-antecipada-2",
          usuario_id: "user-1",
          data_vencimento: in3DaysStr,
          data_envio_ultima_notificacao: null,
          valor: 300,
          mes: 8,
          ano: 2026,
          passageiro: {
            id: "pas-2",
            nome: "Mariana Souza",
            nome_responsavel: "Ana Souza",
            telefone_responsavel: "11999992222",
            enviar_notificacoes: true
          },
          motorista: {
            id: "user-1",
            nome: "Carlos Motorista",
            telefone: "11988881111",
            chave_pix: "carlos@pix.com",
            tipo_chave_pix: "EMAIL"
          }
        },
        {
          id: "cob-atrasada-3",
          usuario_id: "user-1",
          data_vencimento: overdue3DaysStr,
          data_envio_ultima_notificacao: null,
          valor: 280,
          mes: 8,
          ano: 2026,
          passageiro: {
            id: "pas-3",
            nome: "Lucas Lima",
            nome_responsavel: "Roberto Lima",
            telefone_responsavel: "11999993333",
            enviar_notificacoes: true
          },
          motorista: {
            id: "user-1",
            nome: "Carlos Motorista",
            telefone: "11988881111",
            chave_pix: "carlos@pix.com",
            tipo_chave_pix: "EMAIL"
          }
        },
        {
          id: "cob-duplicada-4",
          usuario_id: "user-1",
          data_vencimento: todayStr,
          data_envio_ultima_notificacao: todayStr,
          valor: 350,
          mes: 8,
          ano: 2026,
          passageiro: {
            id: "pas-4",
            nome: "Fernanda Rocha",
            nome_responsavel: "Paulo Rocha",
            telefone_responsavel: "11999994444",
            enviar_notificacoes: true
          },
          motorista: {
            id: "user-1",
            nome: "Carlos Motorista",
            telefone: "11988881111",
            chave_pix: "carlos@pix.com",
            tipo_chave_pix: "EMAIL"
          }
        }
      ];

      vi.spyOn(cobrancaRepository, "getPendentesParaNotificacao").mockResolvedValue({
        data: mockCobrancas as any,
        error: null
      } as any);

      const notifyPassengerSpy = vi.spyOn(notificationService, "notifyPassenger").mockResolvedValue(true);
      const updateBulkSpy = vi.spyOn(cobrancaRepository, "updateBulkUltimaNotificacao").mockResolvedValue({ data: null, error: null } as any);

      await cobrancasNotificacoesJob.runDaily();

      expect(notifyPassengerSpy).toHaveBeenCalledTimes(3);
      expect(notifyPassengerSpy).not.toHaveBeenCalledWith("11999994444", expect.anything(), expect.anything(), expect.anything());

      expect(updateBulkSpy).toHaveBeenCalledWith(
        expect.arrayContaining(["cob-hoje-1", "cob-antecipada-2", "cob-atrasada-3"]),
        todayStr
      );

      vi.restoreAllMocks();
    });

    it("POST /api/jobs/daily-routine - Deve bloquear acesso (401) se token Authorization for omitido ou incorreto", async () => {
      const app = await createApp();

      const responseNoToken = await app.inject({
        method: "POST",
        url: "/api/jobs/daily-routine"
      });
      expect(responseNoToken.statusCode).toBe(401);

      const responseBadToken = await app.inject({
        method: "POST",
        url: "/api/jobs/daily-routine",
        headers: {
          authorization: "Bearer token_invalido_123"
        }
      });
      expect(responseBadToken.statusCode).toBe(401);

      await app.close();
    });

    it("POST /api/jobs/daily-routine - Deve executar com sucesso (200) ao enviar o CRON_SECRET correto", async () => {
      const app = await createApp();

      vi.spyOn(cobrancaRepository, "getPendentesParaNotificacao").mockResolvedValue({ data: [], error: null } as any);
      vi.spyOn(monitorRepository, "getExpiringTrials").mockResolvedValue({ data: [], error: null } as any);
      vi.spyOn(monitorRepository, "getExpiredTrials").mockResolvedValue({ data: [], error: null } as any);
      vi.spyOn(monitorRepository, "cancelExpiredPendingInvoices").mockResolvedValue({ data: [], error: null } as any);
      vi.spyOn(authRepository, "deleteExpiredRecoveryCodes").mockResolvedValue({ data: [], error: null } as any);

      const cronSecret = env.CRON_SECRET || "van360_cron_secret_key_2026";

      const response = await app.inject({
        method: "POST",
        url: "/api/jobs/daily-routine",
        headers: {
          authorization: `Bearer ${cronSecret}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.status).toBe("completed");

      await app.close();
      vi.restoreAllMocks();
    });
  });

  describe("2. Job de Expiração de Trial e Bloqueio de Acesso (jobs/assinaturas-vencimento.job.ts)", () => {
    
    it("Deve transicionar status de motoristas com trial expirado para 'EXPIRED' e bloqueá-los no sistema", async () => {
      const mockExpiredTrial = {
        id: "sub-expired-1",
        usuario_id: "driver-expired-uuid",
        status: SubscriptionStatus.TRIAL,
        trial_ends_at: "2026-08-01T00:00:00.000Z",
        usuarios: {
          id: "driver-expired-uuid",
          nome: "Motorista Trial Vencido",
          telefone: "11977776666"
        }
      };

      vi.spyOn(monitorRepository, "getExpiredTrials").mockResolvedValue({
        data: [mockExpiredTrial] as any,
        error: null
      } as any);

      const updateStatusSpy = vi.spyOn(subscriptionService, "updateStatus").mockResolvedValue({} as any);
      const notifyDriverSpy = vi.spyOn(notificationService, "notifyDriver").mockResolvedValue(true);
      vi.spyOn(subscriptionMonitorService, "logNotification").mockResolvedValue();

      await assinaturasVencimentoJob.runDaily();

      expect(updateStatusSpy).toHaveBeenCalledWith("sub-expired-1", SubscriptionStatus.EXPIRED, expect.any(String));
      expect(notifyDriverSpy).toHaveBeenCalledWith("11977776666", expect.anything(), expect.anything(), expect.anything());

      vi.restoreAllMocks();
    });

    it("Deve retornar isBlocked = true para motoristas com assinatura EXPIRED ou CANCELED", async () => {
      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue({
        id: "sub-expired-99",
        usuario_id: "user-blocked-1",
        status: SubscriptionStatus.EXPIRED,
        trial_ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);

      const isBlockedExpired = await subscriptionService.isBlocked("user-blocked-1");
      expect(isBlockedExpired).toBe(true);

      vi.spyOn(subscriptionService, "getOrCreateSubscription").mockResolvedValue({
        id: "sub-canceled-99",
        usuario_id: "user-blocked-2",
        status: SubscriptionStatus.CANCELED,
        trial_ends_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      } as any);

      const isBlockedCanceled = await subscriptionService.isBlocked("user-blocked-2");
      expect(isBlockedCanceled).toBe(true);

      vi.restoreAllMocks();
    });

    it("Deve negar escrita (403 Forbidden - SAAS_EXPIRED) via checkSubscriptionAccess middleware quando motorista estiver bloqueado", async () => {
      vi.spyOn(subscriptionService, "isBlocked").mockResolvedValue(true);

      const req: any = {
        method: "POST",
        url: "/api/cobrancas",
        usuario_id: "user-expired-123",
        user: { app_metadata: { role: "MOTORISTA" } }
      };

      let sentStatus = 0;
      let sentBody: any = null;

      const reply: any = {
        status: (code: number) => {
          sentStatus = code;
          return {
            send: (body: any) => {
              sentBody = body;
            }
          };
        }
      };

      await checkSubscriptionAccess(req, reply);

      expect(sentStatus).toBe(403);
      expect(sentBody.code).toBe("SAAS_EXPIRED");

      vi.restoreAllMocks();
    });
  });

  describe("3. Rotina de Limpeza de Tokens Expirados (jobs/limpeza-tokens.job.ts)", () => {

    it("Deve executar expurgo de códigos OTP de recuperação de senha vencidos com sucesso", async () => {
      const mockDeletedTokens = [
        { id: "otp-1", usuario_id: "user-a", codigo: "123456", expira_em: "2026-08-01T10:00:00.000Z" },
        { id: "otp-2", usuario_id: "user-b", codigo: "654321", expira_em: "2026-08-02T10:00:00.000Z" }
      ];

      const deleteExpiredSpy = vi.spyOn(authRepository, "deleteExpiredRecoveryCodes").mockResolvedValue({
        data: mockDeletedTokens as any,
        error: null
      } as any);

      const removedCount = await limpezaTokensJob.runDaily();

      expect(deleteExpiredSpy).toHaveBeenCalledWith(expect.any(String));
      expect(removedCount).toBe(2);

      vi.restoreAllMocks();
    });

    it("Deve chamar expurgarCodigosRecuperacaoExpirados diretamente e retornar a contagem de registros removidos", async () => {
      vi.spyOn(authRepository, "deleteExpiredRecoveryCodes").mockResolvedValue({
        data: [{ id: "otp-old" }] as any,
        error: null
      } as any);

      const count = await expurgarCodigosRecuperacaoExpirados();
      expect(count).toBe(1);

      vi.restoreAllMocks();
    });
  });
});
