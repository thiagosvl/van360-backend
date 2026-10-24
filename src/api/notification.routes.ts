import { FastifyInstance } from 'fastify';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

export default async function notificationRoutes(app: FastifyInstance) {
  const controller = new NotificationController();

  app.post('/push-token/revoke', controller.revokeToken.bind(controller));

  app.register(async (authApp) => {
    authApp.addHook('onRequest', authenticate);
    authApp.post('/push-token', controller.registerToken.bind(controller));
  });
}
