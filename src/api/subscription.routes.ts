import { FastifyInstance } from "fastify";
import { subscriptionController } from "../controllers/subscription.controller.js";
import { authenticate } from "../middleware/auth.js";
import { requirePermission } from "../middleware/permissions.middleware.js";

export default async function subscriptionRoutes(app: FastifyInstance) {
  // Todas as rotas de assinatura exigem autenticação
  app.addHook("preHandler", authenticate);

  /**
   * Status e Detalhes da Assinatura do Usuário
   * GET /api/subscriptions/status
   */
  app.get("/status", subscriptionController.getMySubscription);

  /**
   * Planos disponíveis para assinatura
   * GET /api/subscriptions/plans
   */
  app.get("/plans", subscriptionController.listPlans);

  /**
   * Histórico de Faturas de Assinatura
   * GET /api/subscriptions/invoices
   */
  app.get("/invoices", { preHandler: [requirePermission("assinatura.gerenciar")] }, subscriptionController.myInvoices);

  /**
   * Cancelar Assinatura Voluntariamente
   * POST /api/subscriptions/cancel
   */
  app.post("/cancel", { preHandler: [requirePermission("assinatura.gerenciar")] }, subscriptionController.cancelSubscription);

  /**
   * Criação de Checkout (Geração de Pix) para um Plano
   * POST /api/subscriptions/checkout
   */
  app.post("/checkout", { preHandler: [requirePermission("assinatura.gerenciar")] }, subscriptionController.createCheckout);

  /**
   * Status de indicações realizadas pelo motorista
   * GET /api/subscriptions/referral
   */
  app.get("/referral", { preHandler: [requirePermission("assinatura.gerenciar")] }, subscriptionController.getReferralStatus);

  /**
   * Métodos de pagamento salvos (cartões)
   * GET /api/subscriptions/payment-methods
   */
  app.get("/payment-methods", { preHandler: [requirePermission("assinatura.gerenciar")] }, subscriptionController.listPaymentMethods);

  /**
   * Definir método de pagamento como padrão
   * PUT /api/subscriptions/payment-methods/:id/default
   */
  app.put("/payment-methods/:id/default", { preHandler: [requirePermission("assinatura.gerenciar")] }, (req, reply) => subscriptionController.setDefaultPaymentMethod(req as any, reply));

  /**
   * Excluir método de pagamento
   * DELETE /api/subscriptions/payment-methods/:id
   */
  app.delete("/payment-methods/:id", { preHandler: [requirePermission("assinatura.gerenciar")] }, (req, reply) => subscriptionController.deletePaymentMethod(req as any, reply));
}
