import { FastifyInstance } from 'fastify';
import { contractController } from '../controllers/contract.controller.js';
import { authenticate } from '../middleware/auth.js';

export async function contractRoutes(app: FastifyInstance) {
  // Rotas protegidas (requerem autenticação)
  app.post('/contratos', { preHandler: authenticate }, contractController.create);
  app.get('/contratos', { preHandler: authenticate }, contractController.list);
  app.post('/contratos/preview', { preHandler: authenticate }, contractController.preview);
  app.delete('/contratos/:id', { preHandler: authenticate }, contractController.cancel);
  app.get('/contratos/:id/download', { preHandler: authenticate }, contractController.download);
  
  // Rotas públicas (para assinatura)
  app.get('/contratos/publico/:token', contractController.getByToken);
  app.post('/contratos/publico/:token/assinar', contractController.sign);
}
