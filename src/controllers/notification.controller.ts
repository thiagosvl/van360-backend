import { FastifyReply, FastifyRequest } from 'fastify';
import { registerPushTokenSchema } from '../schemas/notification.schema.js';
import { notificationService } from '../services/notifications/notification.service.js';

export class NotificationController {
  async registerToken(request: FastifyRequest, reply: FastifyReply) {
    try {
      const userId = request.usuario_id || request.user?.id;
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const body = registerPushTokenSchema.parse(request.body);
      
      await notificationService.registerPushToken(
        userId,
        body.token,
        body.platform
      );

      return reply.status(200).send({ message: 'Token registered successfully' });
    } catch (error) {
      if (error instanceof Error && error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Validation error', details: error });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
}
