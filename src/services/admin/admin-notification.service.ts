import { logger } from "../../config/logger.js";
import { adminNotificationRepository } from "../../repositories/admin/admin-notification.repository.js";
import type { ListUserNotificationsQuery, DispatchDriverNotificationDTO } from "../../schemas/admin.schema.js";
import {
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
  EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
} from "../../config/constants.js";
import { NotificationChannelEnum, CheckoutPaymentMethod } from "../../types/enums.js";
import { cobrancaService } from "../cobranca.service.js";
import { passageiroService } from "../passageiro.service.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { monitorRepository } from "../../repositories/monitor.repository.js";
import { subscriptionBillingService } from "../subscriptions/subscription-billing.service.js";
import { notificationService } from "../notifications/notification.service.js";
import { userRepository } from "../../repositories/user.repository.js";

export const adminNotificationService = {
  async getUserNotifications(userId: string, query: ListUserNotificationsQuery) {
    const { page, limit } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminNotificationRepository.getUserNotifications(
      userId,
      from,
      to
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
    const { page, limit } = query;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await adminNotificationRepository.getPassengerNotifications(
      passageiroId,
      from,
      to
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

        const subRes = await subscriptionRepository.getSubscriptionByUserId(driverId);
        const sub = subRes.data;
        if (!sub) {
          throw new Error("Motorista não possui assinatura cadastrada.");
        }

        let pixCopyPaste: string | null = null;
        let valor: number = 0;
        let dataVencimentoFatura = sub.data_vencimento || new Date().toISOString();

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
          dataVencimentoFatura = fatura.data_vencimento || dataVencimentoFatura;
        }

        await notificationService.notifyDriver(
          user.telefone || "",
          EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
          {
            nomeMotorista: user.nome,
            email: user.email,
            dataVencimento: dataVencimentoFatura,
            pixCopiaECola: pixCopyPaste,
            valor: valor,
            planoNome: (sub as any).planos?.nome || "Plano Van360",
            usuarioId: driverId,
          },
          {
            channels: [NotificationChannelEnum.WABA, NotificationChannelEnum.RESEND],
            email: user.email,
            usuarioId: driverId,
          }
        );

        return { success: true, pixCopyPaste, valor };
      }

      default: {
        const _exhaustiveCheck: never = body.evento;
        throw new Error(`Evento de notificação desconhecido: ${_exhaustiveCheck}`);
      }
    }
  },
};
