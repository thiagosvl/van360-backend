import { NotificationChannelEnum } from '../../types/enums.js';
import { logger } from "../../config/logger.js";
import { SubscriptionStatus, ConfigKey, CheckoutPaymentMethod } from "../../types/enums.js";
import { subscriptionService } from "./subscription.service.js";
import { subscriptionBillingService } from "./subscription-billing.service.js";
import { subscriptionTrialMonitorService, TrialSubscriptionItem } from "./subscription-trial-monitor.service.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { notificationRepository } from "../../repositories/notification.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { getConfigNumber } from "../configuracao.service.js";
import { getNowBR, getStartOfDayBR, getEndOfDayBR, addDays, diffInDays, toPersistenceString } from "../../utils/date.utils.js";
import {
  EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
  EVENTO_MOTORISTA_ASSINATURA_VENCEU,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO,
  EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
  EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
  EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
  EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO
} from "../../config/constants.js";

interface RenewalSubscriptionItem {
  id: string;
  usuario_id: string;
  plano_id: string;
  data_vencimento: string | null;
  metodo_pagamento: string | null;
  metodo_pagamento_preferencial_id: string | null;
  planos?: { nome?: string; valor?: number } | Array<{ nome?: string; valor?: number }> | null;
  usuarios?: { nome?: string; telefone?: string | null; email?: string | null } | Array<{ nome?: string; telefone?: string | null; email?: string | null }> | null;
}

export const subscriptionMonitorService = {

  async runDailyCheck(): Promise<void> {
    logger.info("[SubscriptionMonitor] Iniciando verificação diária...");

    try {
      await this.warnExpiringTrials();
      await this.expireTrials();
      await this.notifyTrialOnboardingMilestones();
      await this.notifyTrialRecoveries();

      await this.notifyDueTodaySubscriptions();
      await this.checkOverduePayments();
      await this.notifyOverdueReminders();
      await this.notifyRenewalRecoveries();

      await this.cancelExpiredPendingInvoices();

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message }, "[SubscriptionMonitor] Erro na verificação diária");
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

  async notifyTrialOnboardingMilestones(): Promise<void> {
    return subscriptionTrialMonitorService.notifyTrialOnboardingMilestones();
  },

  async processarOnboardingTrial(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    totalPassageiros: number = 0,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    return subscriptionTrialMonitorService.processarOnboardingTrial(sub, now, totalPassageiros, notifiedSet);
  },

  async processarAvisoTrialUltimoDia(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    notifiedSet?: Set<string>,
    totalPassageirosOverride?: number
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    return subscriptionTrialMonitorService.processarAvisoTrialUltimoDia(sub, now, notifiedSet, totalPassageirosOverride);
  },

  async warnExpiringTrials(): Promise<void> {
    return subscriptionTrialMonitorService.warnExpiringTrials();
  },

  async processarExpiracaoTrial(
    sub: TrialSubscriptionItem,
    totalPassageirosOverride?: number
  ): Promise<boolean> {
    return subscriptionTrialMonitorService.processarExpiracaoTrial(sub, totalPassageirosOverride);
  },

  async expireTrials(): Promise<void> {
    return subscriptionTrialMonitorService.expireTrials();
  },

  async processarRecuperacaoTrial(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    valorPromocional?: number,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    return subscriptionTrialMonitorService.processarRecuperacaoTrial(sub, now, valorPromocional, notifiedSet);
  },

  async notifyTrialRecoveries(): Promise<void> {
    return subscriptionTrialMonitorService.notifyTrialRecoveries();
  },

  // ---------------------------------------------------------------------------
  // ASSINATURA PAGA — métodos unitários e de lote
  // ---------------------------------------------------------------------------

  async processarAvisoVencimentoHoje(
    sub: {
      id: string;
      usuario_id: string;
      data_vencimento: string | null;
      metodo_pagamento: string | null;
      planos?: { nome?: string; valor?: number } | Array<{ nome?: string; valor?: number }> | null;
      usuarios?: { nome?: string; telefone?: string | null; email?: string | null } | Array<{ nome?: string; telefone?: string | null; email?: string | null }> | null;
    },
    fatura?: {
      id: string;
      usuario_id: string;
      valor: number;
      pix_copy_paste: string | null;
    },
    notifiedSet?: Set<string>,
    totalPassageiros = 0
  ): Promise<{ tipo: string; cicloRef: string; subId: string; description: string } | null> {
    if (
      sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP ||
      sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD
    ) {
      return null;
    }

    const user = this.getUserObject(sub.usuarios);
    const plan = this.getUserObject(sub.planos);
    if (!user?.telefone || !sub.data_vencimento) return null;

    const tipo = EVENTO_MOTORISTA_ASSINATURA_VENCEU;
    const cicloRef = this.toCicloRef(sub.data_vencimento);

    if (notifiedSet?.has(`${sub.usuario_id}:${tipo}:${cicloRef}`)) return null;
    if (!notifiedSet && await this.hasNotified(sub.usuario_id, tipo, cicloRef)) return null;

    const isPixWithCode = sub.metodo_pagamento === CheckoutPaymentMethod.PIX && Boolean(fatura?.pix_copy_paste);
    const channels = isPixWithCode
      ? [NotificationChannelEnum.WABA, NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND]
      : [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND];

    const valorNumerico = fatura?.valor
      ? Number(fatura.valor)
      : (plan?.valor ? Number(plan.valor) : undefined);

    await notificationService.notifyDriver(user.telefone || "", tipo, {
      nomeMotorista: user.nome,
      email: user.email,
      valor: valorNumerico,
      pixCopiaCola: fatura?.pix_copy_paste ?? undefined,
      metodoCobranca: sub.metodo_pagamento ?? undefined,
      planoNome: plan?.nome,
      dataVencimento: sub.data_vencimento,
      totalPassageiros,
      usuarioId: sub.usuario_id,
    }, { channels, email: user.email ?? undefined, usuarioId: sub.usuario_id });

    if (!notifiedSet) {
      await this.logNotification(sub.usuario_id, tipo, cicloRef);
    }

    return {
      tipo,
      cicloRef,
      subId: sub.id,
      description: "Aviso de vencimento hoje enviado."
    };
  },

  async notifyDueTodaySubscriptions(): Promise<void> {
    const now = getNowBR();
    const startOfDayStr = getStartOfDayBR(now).toISOString();
    const endOfDayStr = getEndOfDayBR(now).toISOString();

    const { data: dueToday, error } = await monitorRepository.getDueTodaySubscriptions(startOfDayStr, endOfDayStr);
    if (error) {
      logger.error({ error: error.message }, "[SubscriptionMonitor] Erro ao buscar assinaturas que vencem hoje");
      return;
    }
    if (!dueToday?.length) return;

    const userIds = dueToday.map(sub => sub.usuario_id);
    const [notifiedSet, { data: pendingInvoices }, passengerCountMap] = await Promise.all([
      this.getNotifiedSet(userIds, [EVENTO_MOTORISTA_ASSINATURA_VENCEU]),
      monitorRepository.getPendingInvoicesByUsers(userIds),
      subscriptionTrialMonitorService.buildPassengerCountMap(userIds)
    ]);
    const pendingUsersMap = new Map(pendingInvoices?.map(p => [p.usuario_id, p]) || []);
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of dueToday) {
      const fatura = pendingUsersMap.get(sub.usuario_id);
      const totalPassageiros = passengerCountMap.get(sub.usuario_id) || 0;
      const result = await this.processarAvisoVencimentoHoje(sub, fatura, notifiedSet, totalPassageiros);
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

  async processarAssinaturaPastDue(
    sub: { id: string; metodo_pagamento: string | null },
    _now: Date = getNowBR()
  ): Promise<boolean> {
    if (sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP) {
      return false;
    }

    await subscriptionService.updateStatus(sub.id, SubscriptionStatus.PAST_DUE, "Mensalidade não paga no dia do vencimento. Conta em carência.");
    return false;
  },

  async processarAssinaturaExpiradaCarencia(sub: any, gracePeriod: number): Promise<boolean> {
    if (sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP) {
      return false;
    }

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

    const startOfTodayStr = getStartOfDayBR(now).toISOString();
    const graceLimitDate = getEndOfDayBR(addDays(now, -gracePeriod)).toISOString();

    const { data: pastDue, error: pdError } = await monitorRepository.getPastDueForGracePeriod(startOfTodayStr, graceLimitDate);
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
    if (sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP) {
      return null;
    }

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

      const plan = this.getUserObject(sub.planos);
      const isPixUrgencyWithCode =
        step.tipo === EVENTO_MOTORISTA_RENOVACAO_URGENCIA &&
        sub.metodo_pagamento === CheckoutPaymentMethod.PIX &&
        Boolean(fatura?.pix_copy_paste);

      const channels = isPixUrgencyWithCode
        ? [NotificationChannelEnum.WABA, NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND]
        : [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND];

      const valorNumerico = fatura?.valor
        ? Number(fatura.valor)
        : (plan?.valor ? Number(plan.valor) : undefined);

      await notificationService.notifyDriver(user.telefone || "", step.tipo, {
        nomeMotorista: user.nome,
        email: user.email,
        valor: valorNumerico,
        pixCopiaCola: fatura?.pix_copy_paste ?? undefined,
        metodoCobranca: sub.metodo_pagamento ?? undefined,
        planoNome: plan?.nome,
        usuarioId: sub.usuario_id,
      }, { channels, email: user.email, usuarioId: sub.usuario_id });

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
    if (sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP) {
      return null;
    }

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
    sub: RenewalSubscriptionItem,
    maxRetries: number,
    failedCount: number,
    hasPendingInvoice: boolean,
    notifiedSet?: Set<string>,
    totalPassageiros = 0
  ): Promise<{ tipo?: string; cicloRef?: string; subId?: string; description?: string } | null> {
    const user = this.getUserObject(sub.usuarios);
    const plan = this.getUserObject(sub.planos);
    if (sub.metodo_pagamento === CheckoutPaymentMethod.APPLE_IAP) {
      return null;
    }
    const isCard = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;

    if (hasPendingInvoice) return null;

    if (isCard && !sub.metodo_pagamento_preferencial_id) {
      logger.info({ subId: sub.id }, "[SubscriptionMonitor] Assinatura via cartão sem método preferencial. Pulando renovação automática.");
      return null;
    }

    const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());
    const now = getNowBR();
    const hojeStr = toPersistenceString(now);
    const vencimentoStr = this.toCicloRef(sub.data_vencimento || now);

    if (isCard && hojeStr < vencimentoStr) {
      return null;
    }

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
          }, { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND], email: user.email ?? undefined, usuarioId: sub.usuario_id });

          await notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
            nomeMotorista: user.nome,
            telefone: user.telefone,
            usuarioId: sub.usuario_id,
            erro: "Número máximo de tentativas atingido.",
            planoNome: plan?.nome,
            origem: "AUTOMATICO"
          }, {
            channels: [NotificationChannelEnum.TELEGRAM],
            jobId: `admin-falha-pagamento-${sub.usuario_id}-max-retries-${cicloRef}`,
            usuarioId: sub.usuario_id,
            email: user.email ?? undefined
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
        paymentMethod: (sub.metodo_pagamento as CheckoutPaymentMethod | null) || CheckoutPaymentMethod.PIX,
        saveCard: false,
        origem: "AUTOMATICO",
      });

      if (!isCard && user?.telefone && fatura.pix_copy_paste && hojeStr < vencimentoStr) {
        const alreadyNotified = notifiedSet
          ? notifiedSet.has(`${sub.usuario_id}:${EVENTO_MOTORISTA_ASSINATURA_VENCENDO}:${cicloRef}`)
          : await this.hasNotified(sub.usuario_id, EVENTO_MOTORISTA_ASSINATURA_VENCENDO, cicloRef);

        if (!alreadyNotified) {
          await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_VENCENDO, {
            nomeMotorista: user.nome,
            email: user.email,
            dataVencimento: sub.data_vencimento,
            pixCopiaCola: fatura.pix_copy_paste,
            valor: fatura.valor,
            planoNome: plan?.nome,
            totalPassageiros,
            usuarioId: sub.usuario_id,
          }, {
            channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND],
            email: user.email ?? undefined,
            usuarioId: sub.usuario_id
          });

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
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      logger.error({ subId: sub.id, error: errorMessage }, "[SubscriptionMonitor] Falha ao gerar fatura/cobrança automática");

      if (isCard && user?.telefone) {
        await notificationService.notifyDriver(user.telefone || "", EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, {
          nomeMotorista: user.nome,
          email: user.email,
          erro: errorMessage || "Cartão recusado",
          usuarioId: sub.usuario_id,
        }, { channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND], email: user.email ?? undefined, usuarioId: sub.usuario_id });

        await notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
          nomeMotorista: user.nome,
          telefone: user.telefone,
          usuarioId: sub.usuario_id,
          erro: errorMessage || "Cartão recusado",
          planoNome: plan?.nome,
          origem: "AUTOMATICO"
        }, {
          channels: [NotificationChannelEnum.TELEGRAM],
          jobId: `admin-falha-pagamento-${sub.usuario_id}-recusado-${cicloRef}`,
          usuarioId: sub.usuario_id,
          email: user.email ?? undefined
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

    const userIds = expiring.map(e => e.usuario_id);
    const cardUserIds = expiring.filter(e => e.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD).map(e => e.usuario_id);
    const tiposPossiveis = [EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO, EVENTO_MOTORISTA_ASSINATURA_VENCENDO];

    const [
      { data: pendingInvoices },
      { data: failedNotifs },
      notifiedSet,
      passengerCountMap
    ] = await Promise.all([
      monitorRepository.getPendingInvoicesByUsers(userIds),
      notificationRepository.getNotificationsForUsers(cardUserIds, [EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO]),
      this.getNotifiedSet(userIds, tiposPossiveis),
      subscriptionTrialMonitorService.buildPassengerCountMap(userIds)
    ]);

    const pendingUsersMap = new Map(pendingInvoices?.map(p => [p.usuario_id, p]) || []);

    const failedCountsMap = new Map<string, number>();
    failedNotifs?.forEach(f => {
      const key = `${f.usuario_id}:${f.ciclo_referencia}`;
      failedCountsMap.set(key, (failedCountsMap.get(key) || 0) + 1);
    });

    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expiring) {
      const isCard = sub.metodo_pagamento === CheckoutPaymentMethod.CREDIT_CARD;
      const cicloRef = this.toCicloRef(sub.data_vencimento || new Date());
      const failedCount = isCard ? (failedCountsMap.get(`${sub.usuario_id}:${cicloRef}`) || 0) : 0;
      const hasPendingInvoice = !!pendingUsersMap.get(sub.usuario_id);
      const totalPassageiros = passengerCountMap.get(sub.usuario_id) || 0;

      const result = await this.processarGeracaoFaturaRenovacao(
        sub,
        maxRetries,
        failedCount,
        hasPendingInvoice,
        notifiedSet,
        totalPassageiros
      );
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
