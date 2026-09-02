import { logger } from "../../config/logger.js";
import { adminNotificationRepository } from "../../repositories/admin/admin-notification.repository.js";
import type { ListUserNotificationsQuery, DispatchDriverNotificationDTO } from "../../schemas/admin.schema.js";
import {
  EVENTO_MOTORISTA_RESUMO_SEMANAL_PARCELAS,
  EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA,
} from "../../config/constants.js";
import { cobrancaService } from "../cobranca.service.js";
import { passageiroService } from "../passageiro.service.js";

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
      logger.error({ error, passageiroId }, "[AdminNotificationService] Erro ao buscar notificações do passageiro.");
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

      default: {
        const _exhaustiveCheck: never = body.evento;
        throw new Error(`Evento de notificação desconhecido: ${_exhaustiveCheck}`);
      }
    }
  },
};
