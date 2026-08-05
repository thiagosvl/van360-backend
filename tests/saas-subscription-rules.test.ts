import { describe, it, expect } from "vitest";
import { SubscriptionStatus, IndicacaoStatus } from "../src/types/enums.js";

interface SubscriptionRecord {
  id: string;
  usuario_id: string;
  status: SubscriptionStatus;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  data_vencimento?: string | null;
}

interface ReferralRecord {
  id: string;
  indicador_id: string;
  indicado_id: string;
  status: IndicacaoStatus;
}

function checkIsBlocked(sub: SubscriptionRecord, currentDate: Date = new Date()): boolean {
  if (sub.status === SubscriptionStatus.EXPIRED || sub.status === SubscriptionStatus.CANCELED) {
    return true;
  }

  if (sub.status === SubscriptionStatus.TRIAL) {
    if (!sub.trial_ends_at) return false;
    const trialLimit = new Date(sub.trial_ends_at);
    if (isNaN(trialLimit.getTime())) return false;
    return trialLimit < currentDate;
  }

  return false;
}

function calculateReferralBonusExpiry(
  sub: SubscriptionRecord,
  bonusDays: number,
  currentDate: Date = new Date()
): Date {
  let baseDate = currentDate;

  if (sub.status === SubscriptionStatus.TRIAL && sub.trial_ends_at) {
    baseDate = new Date(sub.trial_ends_at);
  } else if (sub.data_vencimento) {
    baseDate = new Date(sub.data_vencimento);
  } else if (sub.current_period_end) {
    baseDate = new Date(sub.current_period_end);
  }

  if (baseDate < currentDate) {
    baseDate = currentDate;
  }

  const result = new Date(baseDate);
  result.setDate(result.getDate() + bonusDays);
  return result;
}

function buildReferralSummary(
  userId: string,
  referrals: ReferralRecord[],
  bonusDays: number = 30,
  discountPct: number = 10,
  frontendUrl: string = "https://app.van360.com.br"
) {
  const total = referrals.length;
  const completed = referrals.filter((r) => r.status === IndicacaoStatus.COMPLETED).length;
  const pending = referrals.filter((r) => r.status === IndicacaoStatus.PENDING).length;

  return {
    total,
    completed,
    pending,
    referralCode: userId,
    referralLink: `${frontendUrl}/cadastro?ref=${userId}`,
    bonusDays,
    discountPct
  };
}

describe("Suíte de Testes - Regras de Assinatura SaaS e Programa de Indicação", () => {
  describe("1. Ciclo de Status de Assinatura SaaS (Trial, Ativa, Vencida, Cancelada)", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");

    it("Deve permitir acesso (não bloqueado) para assinaturas em Trial com data futura", () => {
      const sub: SubscriptionRecord = {
        id: "sub_1",
        usuario_id: "user_1",
        status: SubscriptionStatus.TRIAL,
        trial_ends_at: "2026-08-15T23:59:59.000Z"
      };

      expect(checkIsBlocked(sub, now)).toBe(false);
    });

    it("Deve bloquear acesso quando o período de Trial expirou", () => {
      const sub: SubscriptionRecord = {
        id: "sub_2",
        usuario_id: "user_2",
        status: SubscriptionStatus.TRIAL,
        trial_ends_at: "2026-08-01T23:59:59.000Z"
      };

      expect(checkIsBlocked(sub, now)).toBe(true);
    });

    it("Deve permitir acesso para assinaturas com status 'ativa'", () => {
      const sub: SubscriptionRecord = {
        id: "sub_3",
        usuario_id: "user_3",
        status: SubscriptionStatus.ACTIVE,
        current_period_end: "2026-09-01T00:00:00.000Z"
      };

      expect(checkIsBlocked(sub, now)).toBe(false);
    });

    it("Deve bloquear acesso para assinaturas com status 'vencida' (EXPIRED)", () => {
      const sub: SubscriptionRecord = {
        id: "sub_4",
        usuario_id: "user_4",
        status: SubscriptionStatus.EXPIRED,
        current_period_end: "2026-08-01T00:00:00.000Z"
      };

      expect(checkIsBlocked(sub, now)).toBe(true);
    });

    it("Deve bloquear acesso para assinaturas com status 'cancelada' (CANCELED)", () => {
      const sub: SubscriptionRecord = {
        id: "sub_5",
        usuario_id: "user_5",
        status: SubscriptionStatus.CANCELED
      };

      expect(checkIsBlocked(sub, now)).toBe(true);
    });
  });

  describe("2. Cálculo de Créditos e Bônus do Programa de Indicação", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");

    it("Deve adicionar 30 dias de bônus à data final do Trial de um motorista", () => {
      const sub: SubscriptionRecord = {
        id: "sub_trial",
        usuario_id: "indicador_1",
        status: SubscriptionStatus.TRIAL,
        trial_ends_at: "2026-08-10T12:00:00.000Z"
      };

      const newExpiry = calculateReferralBonusExpiry(sub, 30, now);
      expect(newExpiry.toISOString()).toBe("2026-09-09T12:00:00.000Z");
    });

    it("Deve estender o vencimento a partir de hoje se a data de vencimento anterior já expirou", () => {
      const sub: SubscriptionRecord = {
        id: "sub_expirada",
        usuario_id: "indicador_2",
        status: SubscriptionStatus.EXPIRED,
        data_vencimento: "2026-07-01T12:00:00.000Z"
      };

      const newExpiry = calculateReferralBonusExpiry(sub, 30, now);
      expect(newExpiry.toISOString()).toBe("2026-09-04T12:00:00.000Z");
    });

    it("Deve calcular corretamente os totais de indicações concluídas e pendentes no resumo", () => {
      const referrals: ReferralRecord[] = [
        { id: "ref_1", indicador_id: "user_top", indicado_id: "ind_1", status: IndicacaoStatus.COMPLETED },
        { id: "ref_2", indicador_id: "user_top", indicado_id: "ind_2", status: IndicacaoStatus.COMPLETED },
        { id: "ref_3", indicador_id: "user_top", indicado_id: "ind_3", status: IndicacaoStatus.PENDING }
      ];

      const summary = buildReferralSummary("user_top", referrals, 30, 10, "https://app.van360.com.br");

      expect(summary.total).toBe(3);
      expect(summary.completed).toBe(2);
      expect(summary.pending).toBe(1);
      expect(summary.referralLink).toBe("https://app.van360.com.br/cadastro?ref=user_top");
    });
  });
});
