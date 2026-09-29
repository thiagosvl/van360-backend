import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../config/logger.js";
import { adminNotificationService } from "../../services/admin/admin-notification.service.js";
import { listUserNotificationsQuerySchema, retrySingleNotificationSchema, retryBulkNotificationsSchema } from "../../schemas/admin.schema.js";

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
      logger.error({ error: error.message, id }, "[AdminNotificationController] Erro ao buscar notificações do aluno.");
      return reply.status(500).send({ error: "Erro ao buscar notificações do aluno." });
    }
  },

  async getGlobalNotifications(request: FastifyRequest, reply: FastifyReply) {
    try {
      const query = listUserNotificationsQuerySchema.parse(request.query);
      const result = await adminNotificationService.getGlobalNotifications(query);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminNotificationController] Erro ao buscar notificações globais.");
      return reply.status(500).send({ error: "Erro ao buscar notificações globais." });
    }
  },

  async retryNotification(request: FastifyRequest, reply: FastifyReply) {
    const { id } = request.params as { id: string };
    try {
      const body = retrySingleNotificationSchema.parse(request.body || {});
      const result = await adminNotificationService.retryNotification(id, body.executeImmediately);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message, id }, "[AdminNotificationController] Erro ao retentar notificação.");
      return reply.status(400).send({ error: error.message || "Erro ao retentar notificação." });
    }
  },

  async retryBulkNotifications(request: FastifyRequest, reply: FastifyReply) {
    try {
      const body = retryBulkNotificationsSchema.parse(request.body);
      const result = await adminNotificationService.retryBulkNotifications(body);
      return reply.status(200).send(result);
    } catch (err: unknown) {
      const error = err as Error;
      logger.error({ error: error.message }, "[AdminNotificationController] Erro ao reprocessar notificações em lote.");
      return reply.status(400).send({ error: error.message || "Erro ao reprocessar notificações em lote." });
    }
  },
};

