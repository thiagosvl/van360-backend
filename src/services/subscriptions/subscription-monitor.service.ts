import { NotificationChannelEnum } from '../../types/enums.js';
import { logger } from "../../config/logger.js";
import { SubscriptionStatus, ConfigKey, CheckoutPaymentMethod } from "../../types/enums.js";
import { subscriptionService } from "./subscription.service.js";
import { subscriptionBillingService } from "./subscription-billing.service.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { notificationRepository } from "../../repositories/notification.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { getConfigNumber, getConfig } from "../configuracao.service.js";
import { getNowBR, getEndOfDayBR, addDays, diffInDays, toPersistenceString } from "../../utils/date.utils.js";
import {
  EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
  EVENTO_MOTORISTA_ASSINATURA_VENCEU,
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
  TRIAL_BONUS_INACTIVE_DAYS,
  TRIAL_INACTIVE_PASSENGERS_THRESHOLD,
  EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
  EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
  EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO
} from "../../config/constants.js";

/**
 * Monitor de Assinaturas (Job Logic)
 * Responsável por gerenciar transições automáticas de estado por tempo (Cron).
 */
export const subscriptionMonitorService = {

  // ---------------------------------------------------------------------------
  // ORQUESTRADOR
  // ---------------------------------------------------------------------------

  async runDailyCheck(): Promise<void> {
    logger.info("[SubscriptionMonitor] Iniciando verificação diária...");

    try {
      const daysBeforeTrial = await getConfigNumber(ConfigKey.SAAS_DIAS_AVISO_TRIAL, 3);

      // --- TRIAL ---
      await this.warnExpiringTrials();                   // Avisos antes de expirar (1 dia)
      await this.expireTrials();                          // D=trial_ends_at: expira + notifica
      await this.notifyTrialRecoveries();                 // D+16/+20/+25: recuperação pós-expiry

      // --- ASSINATURA PAGA ---
      await this.checkOverduePayments();                  // D=venc: ACTIVE→PAST_DUE; D+carência: →EXPIRED
      await this.notifyOverdueReminders();                // D+1/+2: lembretes PAST_DUE
      await this.notifyRenewalRecoveries();               // D+5/+10: recuperação pós-EXPIRED

      // --- LIMPEZA ---
      await this.cancelExpiredPendingInvoices();          // Cancela faturas PENDING vencidas

    } catch (error: any) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro na verificação diária");
      throw error;
    }
  },

  // ---------------------------------------------------------------------------
  // HELPERS — deduplicação via assinatura_notificacoes
  // ---------------------------------------------------------------------------

  async hasNotified(usuarioId: string, tipo: string, cicloRef: string): Promise<boolean> {
    return notificationRepository.hasNotified(usuarioId, tipo, cicloRef);
  },

  async logNotification(usuarioId: string, tipo: string, cicloRef: string): Promise<void> {
    return notificationRepository.logNotification(usuarioId, tipo, cicloRef);
  },

  async getNotifiedSet(userIds: string[], tipos: string[]): Promise<Set<string>> {
    const { data } = await notificationRepository.getNotificationsForUsers(userIds, tipos);
    return new Set(data?.map(d => `${d.usuario_id}:${d.tipo}:${d.ciclo_referencia}`) || []);
  },

  async logNotificationsBulk(
    logs: { usuarioId: string, tipo: string, cicloRef: string }[]
  ): Promise<void> {
    if (logs.length === 0) return;

    const notifLogs = logs.map(l => ({
      usuario_id: l.usuarioId,
      tipo: l.tipo,
      ciclo_referencia: l.cicloRef
    }));
    await notificationRepository.logNotificationsBulk(notifLogs);
  },

  // Retorna YYYY-MM-DD de uma string ISO ou Date no fuso de Brasília
  toCicloRef(date: string | Date): string {
    return toPersistenceString(date);
  },

  getUserObject(rawUser: any): any {
    return Array.isArray(rawUser) ? rawUser[0] : rawUser;
  },

  // Janela de N±1 dias a partir de uma data de referência (resistente a job skippe)
  windowAround(baseDate: Date, daysAgo: number): { from: string; to: string } {
    return {
      from: addDays(baseDate, -(daysAgo + 1)).toISOString(),
      to: getEndOfDayBR(addDays(baseDate, -(daysAgo - 1))).toISOString(),
    };
  },

  // ---------------------------------------------------------------------------
  // LIMPEZA DE FATURAS
  // ---------------------------------------------------------------------------

  async cancelExpiredPendingInvoices(): Promise<void> {
    logger.info("[SubscriptionMonitor] Verificando faturas PENDING vencidas...");
    const now = getNowBR().toISOString();

    const { error } = await monitorRepository.cancelExpiredPendingInvoices(now);

    if (error) {
      logger.error({ error }, "[SubscriptionMonitor] Erro ao cancelar faturas vencidas");
    } else {
      logger.info("[SubscriptionMonitor] Faturas vencidas canceladas com sucesso (se existiam).");
    }
  },

  // ---------------------------------------------------------------------------
  // TRIAL — métodos unitários e de lote
  // ---------------------------------------------------------------------------

  async processarAvisoTrialUltimoDia(
    sub: any,
    now: Date = getNowBR(),
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    const user = this.getUserObject((sub as any).usuarios);
    if (!user?.telefone || !sub.trial_ends_at) return null;

    const daysLeft = diffInDays(now, sub.trial_ends_at);
    if (daysLeft !== 1) return null;

    const jaEstendeu = Boolean(sub.trial_estendido);
    const { count } = await monitorRepository.getPassengerCount(sub.usuario_id);
    const totalPassageiros = count ?? 0;

    if (totalPassageiros < TRIAL_INACTIVE_PASSENGERS_THRESHOLD && !jaEstendeu) {
      const tipo: string = EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO;
      const cicloRef = this.toCicloRef(sub.trial_ends_at);

      if (notifiedSet?.has(`${sub.usuario_id}:${tipo}:${cicloRef}`)) return null;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, tipo, cicloRef)) return null;

      const novoTrialEnd = getEndOfDayBR(addDays(new Date(sub.trial_ends_at), TRIAL_BONUS_INACTIVE_DAYS)).toISOString();
      await subscriptionRepository.extendTrialBonus(sub.id, novoTrialEnd);

      logger.info({
        usuarioId: sub.usuario_id,
        totalPassageiros,
        novoTrialEnd
      }, "[SubscriptionMonitor] Bônus de trial (+7 dias) concedido para motorista inativo");

      await notificationService.notifyDriver(user.telefone || "", tipo, {
        nomeMotorista: user.nome,
        email: user.email,
        bonusDays: TRIAL_BONUS_INACTIVE_DAYS,
        dataVencimento: novoTrialEnd,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

      if (!notifiedSet) {
        await this.logNotification(sub.usuario_id, tipo, cicloRef);
      }

      return { tipo, cicloRef };
    }

    const tipo: string = EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO;
    const cicloRef = this.toCicloRef(sub.trial_ends_at);

    if (notifiedSet?.has(`${sub.usuario_id}:${tipo}:${cicloRef}`)) return null;
    if (!notifiedSet && await this.hasNotified(sub.usuario_id, tipo, cicloRef)) return null;

    await notificationService.notifyDriver(user.telefone || "", tipo, {
      nomeMotorista: user.nome,
      email: user.email,
      trialDays: daysLeft,
      dataVencimento: sub.trial_ends_at,
      usuarioId: sub.usuario_id,
    }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

    if (!notifiedSet) {
      await this.logNotification(sub.usuario_id, tipo, cicloRef);
    }

    return { tipo, cicloRef };
  },

  async warnExpiringTrials(): Promise<void> {
    const now = getNowBR();
    const daysBeforeExpiry = 1;

    const windowStart = now.toISOString();
    const windowEnd = getEndOfDayBR(addDays(now, daysBeforeExpiry)).toISOString();

    const { data: expiring, error } = await monitorRepository.getExpiringTrials(windowStart, windowEnd);
    if (error || !expiring?.length) return;

    const userIds = expiring.map((sub: any) => sub.usuario_id);
    const tiposPossiveis = [EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO, EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO];
    const notifiedSet = await this.getNotifiedSet(userIds, tiposPossiveis);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expiring) {
      const result = await this.processarAvisoTrialUltimoDia(sub, now, notifiedSet);
      if (result) {
        logsToSave.push({
          usuarioId: sub.usuario_id,
          tipo: result.tipo,
          cicloRef: result.cicloRef
        });
      }
    }

    await this.logNotificationsBulk(logsToSave);
  },

  async processarExpiracaoTrial(sub: any): Promise<boolean> {
    const user = this.getUserObject((sub as any).usuarios);
    const jaEstendeu = Boolean(sub.trial_estendido);
    const { count } = await monitorRepository.getPassengerCount(sub.usuario_id);
    const totalPassageiros = count ?? 0;

    if (totalPassageiros < TRIAL_INACTIVE_PASSENGERS_THRESHOLD && !jaEstendeu) {
      const tipo: string = EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO;
      const cicloRef = this.toCicloRef(sub.trial_ends_at || new Date());

      const novoTrialEnd = getEndOfDayBR(addDays(getNowBR(), TRIAL_BONUS_INACTIVE_DAYS)).toISOString();
      await subscriptionRepository.extendTrialBonus(sub.id, novoTrialEnd);

      logger.info({
        usuarioId: sub.usuario_id,
        totalPassageiros,
        novoTrialEnd
      }, "[SubscriptionMonitor] Bônus de trial (+7 dias) concedido via fallback de expiração para motorista inativo");

      if (user?.telefone) {
        await notificationService.notifyDriver(user.telefone || "", tipo, {
          nomeMotorista: user.nome,
          email: user.email,
          bonusDays: TRIAL_BONUS_INACTIVE_DAYS,
          dataVencimento: novoTrialEnd,
          usuarioId: sub.usuario_id,
        }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

        await this.logNotification(sub.usuario_id, tipo, cicloRef);
      }

      return false;
    }

    await subscriptionService.updateStatus(sub.id, SubscriptionStatus.EXPIRED, "Período de teste encerrado.");

    if (user?.telefone) {
      await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_TESTE_ENCERRADO, {
        nomeMotorista: user.nome,
        email: user.email,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });
      await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_TESTE_ENCERRADO, this.toCicloRef(sub.trial_ends_at || new Date()));
      return true;
    }
    return false;
  },

  async expireTrials(): Promise<void> {
    const now = getNowBR().toISOString();
    const { data: expiredTrials, error } = await monitorRepository.getExpiredTrials(now);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar trials expirados");
      return;
    }
    if (!expiredTrials?.length) return;

    logger.info({ count: expiredTrials.length }, "[SubscriptionMonitor] Expirando trials...");

    for (const sub of expiredTrials) {
      await this.processarExpiracaoTrial(sub);
    }
  },

  async processarRecuperacaoTrial(
    sub: any,
    now: Date = getNowBR(),
    valorPromocional?: number,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    const user = this.getUserObject((sub as any).usuarios);
    if (!user?.telefone || !sub.trial_ends_at) return null;

    const recoverySteps = [
      { daysAgo: 7, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1 },
      { daysAgo: 15, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 },
    ];

    const cicloRef = this.toCicloRef(sub.trial_ends_at);
    const daysSinceExpiry = diffInDays(sub.trial_ends_at, now);

    for (const step of recoverySteps) {
      const inWindow = daysSinceExpiry >= step.daysAgo - 1 && daysSinceExpiry <= step.daysAgo + 1;
      if (!inWindow) continue;

      if (notifiedSet?.has(`${sub.usuario_id}:${step.tipo}:${cicloRef}`)) continue;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

      await notificationService.notifyDriver(user.telefone || "", step.tipo, {
        nomeMotorista: user.nome,
        email: user.email,
        valorPromocional: step.tipo === EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 ? valorPromocional : undefined,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

      if (!notifiedSet) {
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef);
      }

      return { tipo: step.tipo, cicloRef };
    }

    return null;
  },

  async notifyTrialRecoveries(): Promise<void> {
    const now = getNowBR();

    const recoverySteps = [
      { daysAgo: 7, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1 },
      { daysAgo: 15, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 },
    ];

    const windows = recoverySteps.map(step => this.windowAround(now, step.daysAgo));
    const { data: expired, error } = await monitorRepository.getExpiredTrialsForRecovery(windows);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar trials expirados para recuperação");
      return;
    }
    if (!expired?.length) return;

    const isPromotionActive = (await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false")) === "true";
    let valorPromocional: number | undefined;
    if (isPromotionActive) {
      const { data: plano } = await monitorRepository.getPromotionValue();
      valorPromocional = plano?.valor_promocional ?? undefined;
    }

    const userIds = expired.map((sub: any) => sub.usuario_id);
    const tiposPossiveis = recoverySteps.map(s => s.tipo);
    const notifiedSet = await this.getNotifiedSet(userIds, tiposPossiveis);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expired) {
      const result = await this.processarRecuperacaoTrial(sub, now, valorPromocional, notifiedSet);
      if (result) {
        logsToSave.push({ usuarioId: sub.usuario_id, tipo: result.tipo, cicloRef: result.cicloRef });
      }
    }

    await this.logNotificationsBulk(logsToSave);
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — métodos unitários e de lote
  // ---------------------------------------------------------------------------

  async processarAssinaturaPastDue(sub: any, now: Date = getNowBR()): Promise<boolean> {
    await subscriptionService.updateStatus(sub.id, SubscriptionStatus.PAST_DUE, "Mensalidade não paga no dia do vencimento. Conta em carência.");

    const user = this.getUserObject((sub as any).usuarios);
    const daysSinceExpiry = sub.data_vencimento ? diffInDays(sub.data_vencimento, now) : 0;

    if (user?.telefone && daysSinceExpiry === 0) {
      await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_VENCEU, {
        nomeMotorista: user.nome,
        email: user.email,
        planoNome: (sub as any).planos?.nome,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });
      await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCEU, this.toCicloRef(sub.data_vencimento || new Date()));
      return true;
    }
    return false;
  },

  async processarAssinaturaExpiradaCarencia(sub: any, gracePeriod: number): Promise<boolean> {
    await subscriptionService.updateStatus(sub.id, SubscriptionStatus.EXPIRED, `Assinatura expirada por falta de pagamento (${gracePeriod} dias de atraso).`);

    const user = this.getUserObject((sub as any).usuarios);
    if (user?.telefone) {
      await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_ATRASADA, {
        nomeMotorista: user.nome,
        email: user.email,
        diasAtraso: gracePeriod,
        planoNome: (sub as any).planos?.nome,
        valor: (sub as any).planos?.valor ? Number((sub as any).planos.valor) : undefined,
        metodoCobranca: (sub as any).metodo_pagamento ?? undefined,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });
      await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_ATRASADA, this.toCicloRef(sub.data_vencimento || new Date()));
      return true;
    }
    return false;
  },

  async checkOverduePayments(): Promise<void> {
    const now = getNowBR();
    const gracePeriod = await getConfigNumber(ConfigKey.SAAS_DIAS_CARENCIA, 3);

    const nowStr = now.toISOString();
    const graceLimitDate = getEndOfDayBR(addDays(now, -gracePeriod)).toISOString();

    const { data: pastDue, error: pdError } = await monitorRepository.getPastDueForGracePeriod(nowStr, graceLimitDate);
    if (pdError) {
      logger.error({ error: pdError.message }, "[SubscriptionMonitor] Erro ao buscar assinaturas vencidas");
    } else if (pastDue?.length) {
      for (const sub of pastDue) {
        await this.processarAssinaturaPastDue(sub, now);
      }
    }

    const { data: expired, error: expError } = await monitorRepository.getExpiredForGracePeriod(graceLimitDate);
    if (expError) {
      logger.error({ error: expError.message }, "[SubscriptionMonitor] Erro ao buscar assinaturas p/ expirar");
    } else if (expired?.length) {
      for (const sub of expired) {
        await this.processarAssinaturaExpiradaCarencia(sub, gracePeriod);
      }
    }
  },

  async processarLembretePastDue(
    sub: any,
    now: Date = getNowBR(),
    fatura?: any,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string; subId: string; description: string } | null> {
    const user = this.getUserObject((sub as any).usuarios);
    if (!user?.telefone || !sub.data_vencimento) return null;

    const reminderSteps: Array<{ daysAgo: number; tipo: string }> = [
      { daysAgo: 1, tipo: EVENTO_MOTORISTA_RENOVACAO_LEMBRETE },
      { daysAgo: 2, tipo: EVENTO_MOTORISTA_RENOVACAO_URGENCIA },
    ];

    const cicloRef = this.toCicloRef(sub.data_vencimento);
    const daysSince = diffInDays(sub.data_vencimento, now);

    for (const step of reminderSteps) {
      if (daysSince !== step.daysAgo) continue;
      if (notifiedSet?.has(`${sub.usuario_id}:${step.tipo}:${cicloRef}`)) continue;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

      await notificationService.notifyDriver(user.telefone || "", step.tipo, {
        nomeMotorista: user.nome,
        email: user.email,
        valor: fatura?.valor ? Number(fatura.valor) : undefined,
        pixCopiaECola: fatura?.pix_copy_paste ?? undefined,
        metodoCobranca: sub.metodo_pagamento ?? undefined,
        planoNome: (sub as any).planos?.nome,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

      if (!notifiedSet) {
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef);
      }

      return {
        tipo: step.tipo,
        cicloRef,
        subId: sub.id,
        description: `Lembrete de pagamento pendente enviado (${step.daysAgo} dias de atraso).`
      };
    }

    return null;
  },

  async notifyOverdueReminders(): Promise<void> {
    const now = getNowBR();

    const reminderSteps: Array<{ daysAgo: number; tipo: string }> = [
      { daysAgo: 1, tipo: EVENTO_MOTORISTA_RENOVACAO_LEMBRETE },
      { daysAgo: 2, tipo: EVENTO_MOTORISTA_RENOVACAO_URGENCIA },
    ];

    const windows = reminderSteps.map(step => this.windowAround(now, step.daysAgo));
    const { data: pastDue, error } = await monitorRepository.getPastDueForReminders(windows);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar PAST_DUE para lembretes");
      return;
    }
    if (!pastDue?.length) return;

    const userIds = pastDue.map((sub: any) => sub.usuario_id);
    const tiposPossiveis = reminderSteps.map(s => s.tipo);
    const notifiedSet = await this.getNotifiedSet(userIds, tiposPossiveis);
    const { data: pendingInvoices } = await monitorRepository.getPendingInvoicesByUsers(userIds);
    const pendingUsersMap = new Map(pendingInvoices?.map((p: any) => [p.usuario_id, p]) || []);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of pastDue) {
      const fatura = pendingUsersMap.get(sub.usuario_id);
      const result = await this.processarLembretePastDue(sub, now, fatura, notifiedSet);
      if (result) {
        logsToSave.push({
          usuarioId: sub.usuario_id,
          tipo: result.tipo,
          cicloRef: result.cicloRef
        });
      }
    }

    await this.logNotificationsBulk(logsToSave);
  },

  async processarRecuperacaoAssinatura(
    sub: any,
    now: Date = getNowBR(),
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string; subId: string; description: string } | null> {
    const user = this.getUserObject((sub as any).usuarios);
    if (!user?.telefone || !sub.data_vencimento) return null;

    const recoverySteps = [
      { daysAgo: 5, tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1 },
      { daysAgo: 10, tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL },
    ];

    const cicloRef = this.toCicloRef(sub.data_vencimento);
    const daysSince = diffInDays(sub.data_vencimento, now);

    for (const step of recoverySteps) {
      const inWindow = daysSince >= step.daysAgo - 1 && daysSince <= step.daysAgo + 1;
      if (!inWindow) continue;

      if (notifiedSet?.has(`${sub.usuario_id}:${step.tipo}:${cicloRef}`)) continue;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

      await notificationService.notifyDriver(user.telefone || "", step.tipo, {
        nomeMotorista: user.nome,
        email: user.email,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

      if (!notifiedSet) {
        await this.logNotification(sub.usuario_id, step.tipo, cicloRef);
      }

      return {
        tipo: step.tipo,
        cicloRef,
        subId: sub.id,
        description: `Oferta de recuperação de assinatura enviada (${step.daysAgo} dias após expiração).`
      };
    }

    return null;
  },

  async notifyRenewalRecoveries(): Promise<void> {
    const now = getNowBR();

    const recoverySteps = [
      { daysAgo: 5, tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1 },
      { daysAgo: 10, tipo: EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL },
    ];

    const windows = recoverySteps.map(step => this.windowAround(now, step.daysAgo));
    const { data: expired, error } = await monitorRepository.getExpiredForRecovery(windows);

    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar expirados (assinantes) para recuperação");
      return;
    }
    if (!expired?.length) return;

    const userIds = expired.map((sub: any) => sub.usuario_id);
    const tiposPossiveis = recoverySteps.map(s => s.tipo);
    const notifiedSet = await this.getNotifiedSet(userIds, tiposPossiveis);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expired) {
      const result = await this.processarRecuperacaoAssinatura(sub, now, notifiedSet);
      if (result) {
        logsToSave.push({
          usuarioId: sub.usuario_id,
          tipo: result.tipo,
          cicloRef: result.cicloRef
        });
      }
    }

    await this.logNotificationsBulk(logsToSave);
  },

  async processarGeracaoFaturaRenovacao(
    sub: any,
    maxRetries: number,
    failedCount: number,
    hasPendingInvoice: boolean,
    notifiedSet?: Set<string>
  ): Promise<{ tipo?: string; cicloRef?: string; subId?: string; description?: string } | null> {
    const user = this.getUserObject((sub as any).usuarios);
    const isCard = sub.metodo_pagamento === "credit_card";

    if (hasPendingInvoice) return null;

    if (isCard && !sub.metodo_pagamento_preferencial_id) {
      logger.info({ subId: sub.id }, "[SubscriptionMonitor] Assinatura via cartão sem método preferencial. Pulando renovação automática.");
      return null;
    }

    const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());

    if (isCard && failedCount >= maxRetries) {
      logger.warn({ subId: sub.id, failedCount, cicloRef }, "[SubscriptionMonitor] Limite de tentativas de cartão atingido para o ciclo. Pulando.");
      if (user?.telefone) {
        const alreadyNotified = notifiedSet
          ? notifiedSet.has(`${sub.usuario_id}:${EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO}:${cicloRef}`)
          : await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef);

        if (!alreadyNotified) {
          await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, {
            nomeMotorista: user.nome,
            email: user.email,
            erro: "Número máximo de tentativas atingido.",
            usuarioId: sub.usuario_id,
          }, { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

          await notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
            nomeMotorista: user.nome,
            telefone: user.telefone,
            usuarioId: sub.usuario_id,
            erro: "Número máximo de tentativas atingido.",
            planoNome: (sub as any).planos?.nome,
            origem: "AUTOMATICO"
          }, {
            channels: [NotificationChannelEnum.TELEGRAM],
            jobId: `admin-falha-pagamento-${sub.usuario_id}-max-retries-${cicloRef}`,
            usuarioId: sub.usuario_id,
            email: user.email
          });

          if (!notifiedSet) {
            await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef);
          }

          return {
            tipo: EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
            cicloRef,
            subId: sub.id,
            description: "Aviso de falha na cobrança automática do cartão enviado."
          };
        }
      }
      return null;
    }

    logger.info({ subId: sub.id, userId: sub.usuario_id }, "[SubscriptionMonitor] Gerando fatura/cobrança de renovação automática...");

    try {
      const fatura = await subscriptionBillingService.createInvoice(sub.usuario_id, {
        planId: sub.plano_id,
        paymentMethod: sub.metodo_pagamento || CheckoutPaymentMethod.PIX,
        saveCard: false,
      });

      if (!isCard && user?.telefone && fatura.pix_copy_paste) {
        const alreadyNotified = notifiedSet
          ? notifiedSet.has(`${sub.usuario_id}:${EVENTO_MOTORISTA_ASSINATURA_VENCENDO}:${cicloRef}`)
          : await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, cicloRef);

        if (!alreadyNotified) {
          await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_VENCENDO, {
            nomeMotorista: user.nome,
            email: user.email,
            dataVencimento: sub.data_vencimento,
            pixCopiaECola: fatura.pix_copy_paste,
            valor: fatura.valor,
            planoNome: (sub as any).planos?.nome,
            usuarioId: sub.usuario_id,
          }, { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

          if (!notifiedSet) {
            await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, cicloRef);
          }

          return {
            tipo: EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
            cicloRef,
            subId: sub.id,
            description: "Aviso de vencimento de PIX enviado."
          };
        }
      } else if (isCard) {
        logger.info({ userId: sub.usuario_id }, "[SubscriptionMonitor] Cobrança de renovação no cartão gerada com sucesso.");
      }
    } catch (e: any) {
      logger.error({ subId: sub.id, error: e.message }, "[SubscriptionMonitor] Falha ao gerar fatura/cobrança automática");

      if (isCard && user?.telefone) {
        await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, {
          nomeMotorista: user.nome,
          email: user.email,
          erro: e.message || "Cartão recusado",
          usuarioId: sub.usuario_id,
        }, { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND], email: user.email, usuarioId: sub.usuario_id });

        await notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
          nomeMotorista: user.nome,
          telefone: user.telefone,
          usuarioId: sub.usuario_id,
          erro: e.message || "Cartão recusado",
          planoNome: (sub as any).planos?.nome,
          origem: "AUTOMATICO"
        }, {
          channels: [NotificationChannelEnum.TELEGRAM],
          jobId: `admin-falha-pagamento-${sub.usuario_id}-recusado-${cicloRef}`,
          usuarioId: sub.usuario_id,
          email: user.email
        });

        const alreadyNotified = notifiedSet
          ? notifiedSet.has(`${sub.usuario_id}:${EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO}:${cicloRef}`)
          : await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef);

        if (!alreadyNotified) {
          if (!notifiedSet) {
            await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, cicloRef);
          }
          return {
            tipo: EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
            cicloRef
          };
        }
      }
    }

    return null;
  },

  async generateRenewalInvoices(daysBefore: number): Promise<void> {
    const now = getNowBR();
    const threshold = addDays(now, daysBefore);
    const maxRetries = await getConfigNumber(ConfigKey.SAAS_MAX_TENTATIVAS_CARTAO, 3);

    const { data: expiring, error } = await monitorRepository.getExpiringSubscriptions(getEndOfDayBR(threshold).toISOString());
    if (error || !expiring) return;

    const userIds = expiring.map((e: any) => e.usuario_id);
    const cardUserIds = expiring.filter((e: any) => e.metodo_pagamento === "credit_card").map((e: any) => e.usuario_id);

    const { data: pendingInvoices } = await monitorRepository.getPendingInvoicesByUsers(userIds);
    const pendingUsersMap = new Map(pendingInvoices?.map((p: any) => [p.usuario_id, p]) || []);

    const { data: failedNotifs } = await notificationRepository.getNotificationsForUsers(cardUserIds, [EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO]);
    const failedCountsMap = new Map<string, number>();
    failedNotifs?.forEach((f: any) => {
      const key = `${f.usuario_id}:${f.ciclo_referencia}`;
      failedCountsMap.set(key, (failedCountsMap.get(key) || 0) + 1);
    });

    const tiposPossiveis = [EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, EVENTO_MOTORISTA_ASSINATURA_VENCENDO];
    const notifiedSet = await this.getNotifiedSet(userIds, tiposPossiveis);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expiring) {
      const isCard = sub.metodo_pagamento === "credit_card";
      const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());
      const failedCount = isCard ? (failedCountsMap.get(`${sub.usuario_id}:${cicloRef}`) || 0) : 0;
      const hasPendingInvoice = !!pendingUsersMap.get(sub.usuario_id);

      const result = await this.processarGeracaoFaturaRenovacao(sub, maxRetries, failedCount, hasPendingInvoice, notifiedSet);
      if (result?.tipo && result?.cicloRef) {
        logsToSave.push({
          usuarioId: sub.usuario_id,
          tipo: result.tipo,
          cicloRef: result.cicloRef
        });
      }
    }

    await this.logNotificationsBulk(logsToSave);
  }
};
