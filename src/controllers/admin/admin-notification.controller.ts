import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminNotificationService } from "../../services/admin/admin-notification.service.js";
import { listUserNotificationsQuerySchema } from "../../schemas/admin.schema.js";

export const adminNotificationController = {
  async getUserNotifications(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const query = listUserNotificationsQuerySchema.parse(request.query);
      const result = await adminNotificationService.getUserNotifications(id, query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, id }, "[AdminNotificationController] Erro ao buscar notificações do usuário.");
      return reply.status(500).send({ error: "Erro ao buscar notificações do usuário." });
    }
  },

  async getPassengerNotifications(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const query = listUserNotificationsQuerySchema.parse(request.query);
      const result = await adminNotificationService.getPassengerNotifications(id, query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, id }, "[AdminNotificationController] Erro ao buscar notificações do passageiro.");
      return reply.status(500).send({ error: "Erro ao buscar notificações do passageiro." });
    }
  },
};
