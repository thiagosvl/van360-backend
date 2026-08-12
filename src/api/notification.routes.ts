import { FastifyInstance } from 'fastify';
import { NotificationController } from '../controllers/notification.controller.js';
import { authenticate } from '../middleware/auth.js';

export default async function notificationRoutes(app: FastifyInstance) {
  const controller = new NotificationController();

  // Middleware de autenticação obrigatório
  app.addHook('onRequest', authenticate);

  app.post('/push-token', controller.registerToken.bind(controller));
}
