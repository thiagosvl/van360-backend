import { logger } from "../../config/logger.js";
import { adminNotificationRepository } from "../../repositories/admin/admin-notification.repository.js";
import type { ListUserNotificationsQuery, DispatchDriverNotificationDTO, RetryBulkNotificationsDTO } from "../../schemas/admin.schema.js";
import {
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
  EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
  EVENTO_MOTORISTA_TESTE_ENCERRADO,
} from "../../config/constants.js";
import { NotificationChannelEnum, CheckoutPaymentMethod, NotificationQueueStatus } from "../../types/enums.js";
import { cobrancaService } from "../cobranca.service.js";
import { passageiroService } from "../passageiro.service.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { subscriptionBillingService } from "../subscriptions/subscription-billing.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { userRepository } from "../../repositories/user.repository.js";
import { notificationRepository } from "../../repositories/notification.repository.js";
import { diffInDays, getNowBR, toPersistenceString } from "../../utils/date.utils.js";
import { notificationQueueRepository, NotificationQueueItemPayload } from "../../repositories/notification-queue.repository.js";
import { NotificationQueueService, notificationQueueService } from "../notifications/notification-queue.service.js";
import { notificationRetryWorker } from "../notifications/notification-retry.worker.js";
import { extractErrorMessage } from "../../utils/error.utils.js";

export const adminNotificationService = {
  async getUserNotifications(userId: string, query: ListUserNotificationsQuery) {
    const { page, limit, ...filters } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminNotificationRepository.getUserNotifications(
      userId,
      from,
      to,
      filters
    );

    if (error) {
      logger.error({ error, userId }, "[AdminNotificationService] Erro ao buscar notificações do usuário.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getPassengerNotifications(passageiroId: string, query: ListUserNotificationsQuery) {
    const { page, limit, ...filters } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminNotificationRepository.getPassengerNotifications(
      passageiroId,
      from,
      to,
      filters
    );

    if (error) {
      logger.error({ error, passageiroId }, "[AdminNotificationService] Erro ao buscar notificações do aluno.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
    };
  },

  async getGlobalNotifications(query: ListUserNotificationsQuery) {
    const { page, limit, ...filters } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const [{ data, error, count }, kpis] = await Promise.all([
      adminNotificationRepository.getGlobalNotifications(from, to, filters),
      adminNotificationRepository.getGlobalNotificationKpis(filters),
    ]);

    if (error) {
      logger.error({ error }, "[AdminNotificationService] Erro ao buscar notificações globais.");
      throw error;
    }

    return {
      data: data || [],
      total: count ?? 0,
      page,
      limit,
      kpis,
    };
  },

  async dispatchToDriver(driverId: string, body: DispatchDriverNotificationDTO, _adminId?: string) {
    switch (body.evento) {
      case EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS: {
        const processed = await cobrancaService.processarResumoSemanalMotorista(driverId);
        return { success: true, processed };
      }

      case EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA: {
        const result = await passageiroService.processarLembreteAniversarioMotorista({ motoristaId: driverId });
        return { success: true, result };
      }

      case EVENTO_MOTORISTA_ASSINATURA_VENCENDO: {
        const userRes = await userRepository.getById(driverId);
        const user = userRes.data;
        if (!user) {
          throw new Error("Motorista não encontrado.");
        }

        const subRes = await subscriptionRepository.getSubscriptionWithPlanByUserId(driverId);
        const sub = subRes.data;
        if (!sub) {
          throw new Error("Motorista não possui assinatura cadastrada.");
        }

        let pixCopyPaste: string | null = null;
        let valor: number = 0;
        const dataVencimentoAssinatura = (sub.status === "TRIAL" && sub.trial_ends_at)
          ? sub.trial_ends_at
          : (sub.data_vencimento || new Date().toISOString());

        const { data: pendingInvoice } = await monitorRepository.getPendingInvoiceByUserId(driverId);
        if (pendingInvoice && pendingInvoice.pix_copy_paste) {
          pixCopyPaste = pendingInvoice.pix_copy_paste;
          valor = Number(pendingInvoice.valor) || 0;
        } else {
          const fatura = await subscriptionBillingService.createInvoice(driverId, {
            planId: sub.plano_id,
            paymentMethod: CheckoutPaymentMethod.PIX,
            saveCard: false,
          });
          pixCopyPaste = fatura.pix_copy_paste || null;
          valor = Number(fatura.valor) || 0;
        }

        await notificationService.notifyDriver(
          user.telefone || "",
          EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
          {
            nomeMotorista: user.nome,
            email: user.email,
            dataVencimento: dataVencimentoAssinatura,
            pixCopiaECola: pixCopyPaste,
            valor: valor,
            planoNome: sub.planos?.nome || "Plano Van360",
            usuarioId: driverId,
          },
          {
            channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND],
            email: user.email,
            usuarioId: driverId,
          }
        );

        const cicloRef = toPersistenceString(dataVencimentoAssinatura);
        await notificationRepository.logNotification(
          driverId,
          EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
          cicloRef
        );

        return { success: true, pixCopyPaste, valor };
      }

      case EVENTO_MOTORISTA_TESTE_ENCERRADO: {
        const userRes = await userRepository.getById(driverId);
        const user = userRes.data;
        if (!user) {
          throw new Error("Motorista não encontrado.");
        }

        const subRes = await subscriptionRepository.getSubscriptionWithPlanByUserId(driverId);
        const sub = subRes.data;
        if (!sub) {
          throw new Error("Motorista não possui assinatura cadastrada.");
        }

        await notificationService.notifyDriver(
          user.telefone || "",
          EVENTO_MOTORISTA_TESTE_ENCERRADO,
          {
            nomeMotorista: user.nome,
            email: user.email,
            usuarioId: driverId,
          },
          {
            channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND],
            email: user.email,
            usuarioId: driverId,
          }
        );

        if (sub.trial_ends_at) {
          const cicloRef = toPersistenceString(sub.trial_ends_at);
          await notificationRepository.logNotification(
            driverId,
            EVENTO_MOTORISTA_TESTE_ENCERRADO,
            cicloRef
          );
        }

        return { success: true };
      }

      case EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO: {
        const userRes = await userRepository.getById(driverId);
        const user = userRes.data;
        if (!user) {
          throw new Error("Motorista não encontrado.");
        }

        const subRes = await subscriptionRepository.getSubscriptionWithPlanByUserId(driverId);
        const sub = subRes.data;
        if (!sub) {
          throw new Error("Motorista não possui assinatura cadastrada.");
        }

        const trialDays = sub.trial_ends_at ? Math.max(1, diffInDays(getNowBR(), sub.trial_ends_at)) : 1;

        await notificationService.notifyDriver(
          user.telefone || "",
          EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
          {
            nomeMotorista: user.nome,
            email: user.email,
            trialDays,
            dataVencimento: sub.trial_ends_at,
            usuarioId: driverId,
          },
          {
            channels: [NotificationChannelEnum.FIREBASE, NotificationChannelEnum.RESEND],
            email: user.email,
            usuarioId: driverId,
          }
        );

        if (sub.trial_ends_at) {
          const cicloRef = toPersistenceString(sub.trial_ends_at);
          await notificationRepository.logNotification(
            driverId,
            EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
            cicloRef
          );
        }

        return { success: true };
      }

      default: {
        const _exhaustiveCheck: never = body.evento;
        throw new Error(`Evento de notificação desconhecido: ${_exhaustiveCheck}`);
      }
    }
  },

  async retryNotification(id: string, executeImmediately = true) {
    const item = await adminNotificationRepository.findNotificationById(id);
    if (!item) {
      throw new Error("Notificação não encontrada na fila.");
    }

    if (!executeImmediately) {
      const reset = await adminNotificationRepository.resetNotificationForRetry(id);
      void notificationRetryWorker.processPendingRetries();
      return { success: true, item: reset, message: "Notificação reenfileirada com sucesso." };
    }

    const eligibility = await notificationQueueService.checkEligibility(item as NotificationQueueItemPayload);
    if (!eligibility.eligible) {
      await notificationQueueRepository.markAsCancelled(id, eligibility.cancelReason || "Item inelegível para reenvio.");
      return {
        success: false,
        status: NotificationQueueStatus.CANCELLED,
        message: eligibility.cancelReason || "Notificação cancelada por inelegibilidade.",
      };
    }

    const maxAttempts = item.max_tentativas || 3;
    const currentAttempts = (item.tentativas || 0) >= maxAttempts ? 1 : (item.tentativas || 0) + 1;

    try {
      const sendResult = await notificationService.sendDirect(
        item.canal as NotificationChannelEnum,
        item.evento,
        { ...(item.payload as Record<string, unknown>), to: item.destinatario },
        { usuarioId: item.usuario_id || undefined }
      );

      if (sendResult.success) {
        await notificationQueueRepository.markAsSent(id, sendResult.providerMessageId, currentAttempts);
        return {
          success: true,
          status: NotificationQueueStatus.SENT,
          providerMessageId: sendResult.providerMessageId,
          message: "Notificação reenviada com sucesso!",
        };
      }

      const errorMsg = sendResult.error || "Erro ao disparar via provedor";
      const errDetail = `${errorMsg} (Tentativa ${currentAttempts}/${maxAttempts})`;
      if (currentAttempts >= maxAttempts) {
        await notificationQueueRepository.markAsFailed(id, currentAttempts, errDetail);
      } else {
        const nextRetryDate = NotificationQueueService.calculateNextRetryDate(currentAttempts + 1);
        await notificationQueueRepository.markAsRetryPending(id, currentAttempts, nextRetryDate, errDetail);
      }

      return {
        success: false,
        status: currentAttempts >= maxAttempts ? NotificationQueueStatus.FAILED : NotificationQueueStatus.RETRY_PENDING,
        error: errorMsg,
        message: `Falha ao reenviar: ${errorMsg}`,
      };
    } catch (error: unknown) {
      const errorMsg = extractErrorMessage(error);
      const errDetail = `${errorMsg} (Tentativa ${currentAttempts}/${maxAttempts})`;
      await notificationQueueRepository.markAsFailed(id, currentAttempts, errDetail);
      return {
        success: false,
        status: NotificationQueueStatus.FAILED,
        error: errorMsg,
        message: `Falha ao reenviar: ${errorMsg}`,
      };
    }
  },

  async retryBulkNotifications(payload: RetryBulkNotificationsDTO) {
    let affectedCount = 0;

    if (payload.ids && payload.ids.length > 0) {
      affectedCount = await adminNotificationRepository.bulkResetNotificationsByIds(payload.ids);
    } else if (payload.filters) {
      affectedCount = await adminNotificationRepository.bulkResetNotificationsByFilters(payload.filters);
    }

    if (affectedCount > 0) {
      void notificationRetryWorker.processPendingRetries();
    }

    return {
      success: true,
      count: affectedCount,
      message: affectedCount > 0
        ? `${affectedCount} notificações foram reenfileiradas com sucesso.`
        : "Nenhuma notificação elegível encontrada para reprocessamento.",
    };
  },
};
