import { FastifyInstance } from 'fastify';
import { contractController } from '../controllers/contract.controller.js';
import { authenticate } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permissions.middleware.js';

export async function contractRoutes(app: FastifyInstance) {
  // Rotas protegidas (requerem autenticação e permissão de gestão de contratos)
  app.post('/contratos', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.create);
  app.post('/contratos/importar', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.importar);
  app.get('/contratos', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.list);
  app.get('/contratos/kpis', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.getKPIs);
  app.post('/contratos/preview', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.preview);
  app.delete('/contratos/:id', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.excluir);
  app.post('/contratos/:id/substituir', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.substituir);
  app.get('/contratos/:id/download', { preHandler: [authenticate, requirePermission("contratos.gerenciar")] }, contractController.download);
  
  // Rotas públicas (para assinatura)
  app.get('/contratos/publico/:token', contractController.getByToken);
  app.post('/contratos/publico/:token/assinar', contractController.sign);
}
