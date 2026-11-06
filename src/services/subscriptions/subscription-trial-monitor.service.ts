import { NotificationChannelEnum, SubscriptionStatus, ConfigKey } from "../../types/enums.js";
import { logger } from "../../config/logger.js";
import { subscriptionService } from "./subscription.service.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { notificationRepository } from "../../repositories/notification.repository.js";
import { notificationService } from "../notifications/notification.service.js";
import { getConfig } from "../configuracao.service.js";
import { getNowBR, getEndOfDayBR, addDays, diffInDays, toPersistenceString } from "../../utils/date.utils.js";
import {
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
  EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
  EVENTO_MOTORISTA_TRIAL_ATIVACAO_D1,
  EVENTO_MOTORISTA_TRIAL_ATIVACAO_D3,
  EVENTO_MOTORISTA_TRIAL_ATIVACAO_D5,
  EVENTO_MOTORISTA_TRIAL_ATIVACAO_D8,
  EVENTO_MOTORISTA_TRIAL_ATIVACAO_D11,
  TRIAL_BONUS_INACTIVE_DAYS,
  TRIAL_INACTIVE_PASSENGERS_THRESHOLD,
} from "../../config/constants.js";

export interface TrialUserRelation {
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  ativo?: boolean | null;
}

export interface TrialSubscriptionItem {
  id: string;
  usuario_id: string;
  status?: string | null;
  data_inicio?: string | null;
  created_at?: string | null;
  trial_ends_at: string | null;
  trial_estendido?: boolean | null;
  usuarios?: TrialUserRelation | TrialUserRelation[] | null;
}

const TRIAL_ONBOARDING_MILESTONES: ReadonlyArray<{ daysElapsed: number; tipo: string }> = [
  { daysElapsed: 1, tipo: EVENTO_MOTORISTA_TRIAL_ATIVACAO_D1 },
  { daysElapsed: 3, tipo: EVENTO_MOTORISTA_TRIAL_ATIVACAO_D3 },
  { daysElapsed: 5, tipo: EVENTO_MOTORISTA_TRIAL_ATIVACAO_D5 },
  { daysElapsed: 8, tipo: EVENTO_MOTORISTA_TRIAL_ATIVACAO_D8 },
  { daysElapsed: 11, tipo: EVENTO_MOTORISTA_TRIAL_ATIVACAO_D11 },
];

const TRIAL_RECOVERY_STEPS: ReadonlyArray<{ daysAgo: number; tipo: string }> = [
  { daysAgo: 7, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1 },
  { daysAgo: 15, tipo: EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 },
];

export const subscriptionTrialMonitorService = {
  getUserObject(rawUser: TrialUserRelation | TrialUserRelation[] | null | undefined): TrialUserRelation | null {
    if (!rawUser) return null;
    return Array.isArray(rawUser) ? (rawUser[0] ?? null) : rawUser;
  },

  toCicloRef(date: string | Date): string {
    return toPersistenceString(date);
  },

  windowAround(baseDate: Date, daysAgo: number): { from: string; to: string } {
    return {
      from: addDays(baseDate, -(daysAgo + 1)).toISOString(),
      to: getEndOfDayBR(addDays(baseDate, -(daysAgo - 1))).toISOString(),
    };
  },

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

  async logNotificationsBulk(logs: { usuarioId: string; tipo: string; cicloRef: string }[]): Promise<void> {
    if (logs.length === 0) return;
    await notificationRepository.logNotificationsBulk(
      logs.map(l => ({ usuario_id: l.usuarioId, tipo: l.tipo, ciclo_referencia: l.cicloRef }))
    );
  },

  async buildPassengerCountMap(userIds: string[]): Promise<Map<string, number>> {
    const countMap = new Map<string, number>();
    if (userIds.length === 0) return countMap;
    const { data } = await monitorRepository.getPassengerCountsByUsers(userIds);
    for (const row of data || []) {
      if (row.usuario_id) countMap.set(row.usuario_id, (countMap.get(row.usuario_id) || 0) + 1);
    }
    return countMap;
  },

  async processarOnboardingTrial(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    totalPassageiros: number = 0,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    const user = this.getUserObject(sub.usuarios);
    const startDate = sub.data_inicio || sub.created_at;
    if (user?.ativo === false || !sub.trial_ends_at || !startDate) return null;

    const daysLeft = diffInDays(now, sub.trial_ends_at);
    if (daysLeft <= 1) return null;

    const daysElapsed = diffInDays(startDate, now);
    const milestone = TRIAL_ONBOARDING_MILESTONES.find(m => m.daysElapsed === daysElapsed);
    if (!milestone) return null;

    const cicloRef = this.toCicloRef(sub.trial_ends_at);
    if (notifiedSet?.has(`${sub.usuario_id}:${milestone.tipo}:${cicloRef}`)) return null;
    if (!notifiedSet && await this.hasNotified(sub.usuario_id, milestone.tipo, cicloRef)) return null;

    await notificationService.notifyDriver(
      user?.telefone || user?.email || sub.usuario_id,
      milestone.tipo,
      {
        nomeMotorista: user?.nome ?? undefined,
        email: user?.email ?? undefined,
        totalPassageiros,
        trialDaysElapsed: daysElapsed,
        trialDaysLeft: daysLeft,
        usuarioId: sub.usuario_id,
      },
      {
        channels: [NotificationChannelEnum.FIREBASE],
        email: user?.email ?? undefined,
        usuarioId: sub.usuario_id,
      }
    );

    if (!notifiedSet) await this.logNotification(sub.usuario_id, milestone.tipo, cicloRef);
    return { tipo: milestone.tipo, cicloRef };
  },

  async notifyTrialOnboardingMilestones(): Promise<void> {
    const now = getNowBR();
    const { data: activeTrials, error } = await monitorRepository.getActiveTrialsForOnboarding(now.toISOString());
    if (error) {
      logger.error({ error: error.message }, "[SubscriptionTrialMonitor] Erro ao buscar trials ativos para onboarding");
      return;
    }
    if (!activeTrials?.length) return;

    const userIds = activeTrials.map(sub => sub.usuario_id);
    const [notifiedSet, passengerCountMap] = await Promise.all([
      this.getNotifiedSet(userIds, TRIAL_ONBOARDING_MILESTONES.map(m => m.tipo)),
      this.buildPassengerCountMap(userIds),
    ]);

    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];
    for (const sub of activeTrials) {
      const totalPassageiros = passengerCountMap.get(sub.usuario_id) ?? 0;
      const result = await this.processarOnboardingTrial(sub, now, totalPassageiros, notifiedSet);
      if (result) logsToSave.push({ usuarioId: sub.usuario_id, tipo: result.tipo, cicloRef: result.cicloRef });
    }
    await this.logNotificationsBulk(logsToSave);
  },

  async processarAvisoTrialUltimoDia(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    notifiedSet?: Set<string>,
    totalPassageirosOverride?: number
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    const user = this.getUserObject(sub.usuarios);
    if (user?.ativo === false || !sub.trial_ends_at) return null;

    const daysLeft = diffInDays(now, sub.trial_ends_at);
    if (daysLeft !== 1) return null;

    const jaEstendeu = Boolean(sub.trial_estendido);
    const totalPassageiros = totalPassageirosOverride !== undefined
      ? totalPassageirosOverride
      : ((await monitorRepository.getPassengerCount(sub.usuario_id)).count ?? 0);

    if (totalPassageiros < TRIAL_INACTIVE_PASSENGERS_THRESHOLD && !jaEstendeu) {
      const tipo = EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO;
      const cicloRef = this.toCicloRef(sub.trial_ends_at);
      if (notifiedSet?.has(`${sub.usuario_id}:${tipo}:${cicloRef}`)) return null;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, tipo, cicloRef)) return null;

      const novoTrialEnd = getEndOfDayBR(addDays(new Date(sub.trial_ends_at), TRIAL_BONUS_INACTIVE_DAYS)).toISOString();
      await subscriptionRepository.extendTrialBonus(sub.id, novoTrialEnd);

      logger.info({ usuarioId: sub.usuario_id, totalPassageiros, novoTrialEnd }, "[SubscriptionTrialMonitor] Bônus de trial (+7 dias) concedido para motorista inativo");

      await notificationService.notifyDriver(user?.telefone || user?.email || sub.usuario_id, tipo, {
        nomeMotorista: user?.nome ?? undefined,
        email: user?.email ?? undefined,
        bonusDays: TRIAL_BONUS_INACTIVE_DAYS,
        dataVencimento: novoTrialEnd,
        totalPassageiros,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user?.email ?? undefined, usuarioId: sub.usuario_id });

      if (!notifiedSet) await this.logNotification(sub.usuario_id, tipo, cicloRef);
      return { tipo, cicloRef };
    }

    const tipo = EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO;
    const cicloRef = this.toCicloRef(sub.trial_ends_at);
    if (notifiedSet?.has(`${sub.usuario_id}:${tipo}:${cicloRef}`)) return null;
    if (!notifiedSet && await this.hasNotified(sub.usuario_id, tipo, cicloRef)) return null;

    await notificationService.notifyDriver(user?.telefone || user?.email || sub.usuario_id, tipo, {
      nomeMotorista: user?.nome ?? undefined,
      email: user?.email ?? undefined,
      trialDays: daysLeft,
      dataVencimento: sub.trial_ends_at,
      totalPassageiros,
      usuarioId: sub.usuario_id,
    }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user?.email ?? undefined, usuarioId: sub.usuario_id });

    if (!notifiedSet) await this.logNotification(sub.usuario_id, tipo, cicloRef);
    return { tipo, cicloRef };
  },

  async warnExpiringTrials(): Promise<void> {
    const now = getNowBR();
    const windowStart = now.toISOString();
    const windowEnd = getEndOfDayBR(addDays(now, 1)).toISOString();

    const { data: expiring, error } = await monitorRepository.getExpiringTrials(windowStart, windowEnd);
    if (error || !expiring?.length) return;

    const userIds = expiring.map(sub => sub.usuario_id);
    const [notifiedSet, passengerCountMap] = await Promise.all([
      this.getNotifiedSet(userIds, [EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO, EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO]),
      this.buildPassengerCountMap(userIds),
    ]);

    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];
    for (const sub of expiring) {
      const totalPassageiros = passengerCountMap.get(sub.usuario_id) ?? 0;
      const result = await this.processarAvisoTrialUltimoDia(sub, now, notifiedSet, totalPassageiros);
      if (result) logsToSave.push({ usuarioId: sub.usuario_id, tipo: result.tipo, cicloRef: result.cicloRef });
    }
    await this.logNotificationsBulk(logsToSave);
  },

  async processarExpiracaoTrial(sub: TrialSubscriptionItem, totalPassageirosOverride?: number): Promise<boolean> {
    const user = this.getUserObject(sub.usuarios);
    const jaEstendeu = Boolean(sub.trial_estendido);
    const totalPassageiros = totalPassageirosOverride !== undefined
      ? totalPassageirosOverride
      : ((await monitorRepository.getPassengerCount(sub.usuario_id)).count ?? 0);

    if (totalPassageiros < TRIAL_INACTIVE_PASSENGERS_THRESHOLD && !jaEstendeu) {
      const tipo = EVENTO_MOTORISTA_TRIAL_BONUS_INATIVO;
      const cicloRef = this.toCicloRef(sub.trial_ends_at || new Date());
      const novoTrialEnd = getEndOfDayBR(addDays(getNowBR(), TRIAL_BONUS_INACTIVE_DAYS)).toISOString();
      await subscriptionRepository.extendTrialBonus(sub.id, novoTrialEnd);

      logger.info({ usuarioId: sub.usuario_id, totalPassageiros, novoTrialEnd }, "[SubscriptionTrialMonitor] Bônus de trial (+7 dias) concedido via fallback de expiração para motorista inativo");

      if (user?.ativo !== false) {
        await notificationService.notifyDriver(user?.telefone || user?.email || sub.usuario_id, tipo, {
          nomeMotorista: user?.nome ?? undefined,
          email: user?.email ?? undefined,
          bonusDays: TRIAL_BONUS_INACTIVE_DAYS,
          dataVencimento: novoTrialEnd,
          totalPassageiros,
          usuarioId: sub.usuario_id,
        }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user?.email ?? undefined, usuarioId: sub.usuario_id });
        await this.logNotification(sub.usuario_id, tipo, cicloRef);
      }
      return false;
    }

    await subscriptionService.updateStatus(sub.id, SubscriptionStatus.EXPIRED, "Período de teste encerrado.");

    if (user?.ativo !== false) {
      await notificationService.notifyDriver(user?.telefone || user?.email || sub.usuario_id, EVENTO_MOTORISTA_TESTE_ENCERRADO, {
        nomeMotorista: user?.nome ?? undefined,
        email: user?.email ?? undefined,
        totalPassageiros,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user?.email ?? undefined, usuarioId: sub.usuario_id });
      await this.logNotification(sub.usuario_id, EVENTO_MOTORISTA_TESTE_ENCERRADO, this.toCicloRef(sub.trial_ends_at || new Date()));
      return true;
    }
    return false;
  },

  async expireTrials(): Promise<void> {
    const now = getNowBR().toISOString();
    const { data: expiredTrials, error } = await monitorRepository.getExpiredTrials(now);
    if (error) {
      logger.error({ error: error.message }, "[SubscriptionTrialMonitor] Erro ao buscar trials expirados");
      return;
    }
    if (!expiredTrials?.length) return;

    logger.info({ count: expiredTrials.length }, "[SubscriptionTrialMonitor] Expirando trials...");
    const passengerCountMap = await this.buildPassengerCountMap(expiredTrials.map(sub => sub.usuario_id));

    for (const sub of expiredTrials) {
      await this.processarExpiracaoTrial(sub, passengerCountMap.get(sub.usuario_id) ?? 0);
    }
  },

  async processarRecuperacaoTrial(
    sub: TrialSubscriptionItem,
    now: Date = getNowBR(),
    valorPromocional?: number,
    notifiedSet?: Set<string>
  ): Promise<{ tipo: string; cicloRef: string } | null> {
    const user = this.getUserObject(sub.usuarios);
    if (user?.ativo === false || !sub.trial_ends_at) return null;

    const cicloRef = this.toCicloRef(sub.trial_ends_at);
    const daysSinceExpiry = diffInDays(sub.trial_ends_at, now);

    for (const step of TRIAL_RECOVERY_STEPS) {
      const inWindow = daysSinceExpiry >= step.daysAgo - 1 && daysSinceExpiry <= step.daysAgo + 1;
      if (!inWindow) continue;
      if (notifiedSet?.has(`${sub.usuario_id}:${step.tipo}:${cicloRef}`)) continue;
      if (!notifiedSet && await this.hasNotified(sub.usuario_id, step.tipo, cicloRef)) continue;

      await notificationService.notifyDriver(user?.telefone || user?.email || sub.usuario_id, step.tipo, {
        nomeMotorista: user?.nome ?? undefined,
        email: user?.email ?? undefined,
        valorPromocional: step.tipo === EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2 ? valorPromocional : undefined,
        usuarioId: sub.usuario_id,
      }, { channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND], email: user?.email ?? undefined, usuarioId: sub.usuario_id });

      if (!notifiedSet) await this.logNotification(sub.usuario_id, step.tipo, cicloRef);
      return { tipo: step.tipo, cicloRef };
    }
    return null;
  },

  async notifyTrialRecoveries(): Promise<void> {
    const now = getNowBR();
    const windows = TRIAL_RECOVERY_STEPS.map(step => this.windowAround(now, step.daysAgo));
    const { data: expired, error } = await monitorRepository.getExpiredTrialsForRecovery(windows);
    if (error) {
      logger.error({ error: error.message }, "[SubscriptionTrialMonitor] Erro ao buscar trials expirados para recuperação");
      return;
    }
    if (!expired?.length) return;

    const isPromotionActive = (await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false")) === "true";
    let valorPromocional: number | undefined;
    if (isPromotionActive) {
      const { data: plano } = await monitorRepository.getPromotionValue();
      valorPromocional = plano?.valor_promocional ?? undefined;
    }

    const userIds = expired.map(sub => sub.usuario_id);
    const notifiedSet = await this.getNotifiedSet(userIds, TRIAL_RECOVERY_STEPS.map(s => s.tipo));
    const logsToSave: { usuarioId: string; tipo: string; cicloRef: string }[] = [];

    for (const sub of expired) {
      const result = await this.processarRecuperacaoTrial(sub, now, valorPromocional, notifiedSet);
      if (result) logsToSave.push({ usuarioId: sub.usuario_id, tipo: result.tipo, cicloRef: result.cicloRef });
    }
    await this.logNotificationsBulk(logsToSave);
  },
};
