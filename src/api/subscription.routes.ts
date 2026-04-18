import { FastifyInstance } from "fastify";
import { subscriptionController } from "../controllers/subscription.controller.js";
import { authenticate } from "../middleware/auth.js";

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
  app.get("/invoices", subscriptionController.myInvoices);

  /**
   * Criação de Checkout (Geração de Pix) para um Plano
   * POST /api/subscriptions/checkout
   */
  app.post("/checkout", subscriptionController.createCheckout);

  /**
   * Status de indicações realizadas pelo motorista
   * GET /api/subscriptions/referral
   */
  app.get("/referral", subscriptionController.getReferralStatus);

  /**
   * Métodos de pagamento salvos (cartões)
   * GET /api/subscriptions/payment-methods
   */
  app.get("/payment-methods", subscriptionController.listPaymentMethods);

  /**
   * Definir método de pagamento como padrão
   * PUT /api/subscriptions/payment-methods/:id/default
   */
  app.put("/payment-methods/:id/default", subscriptionController.setDefaultPaymentMethod);

  /**
   * Excluir método de pagamento
   * DELETE /api/subscriptions/payment-methods/:id
   */
  app.delete("/payment-methods/:id", subscriptionController.deletePaymentMethod);

  /**
   * [DEBUG/TESTE] Resgate de convite (vincular indicador pelo WhatsApp)
   */
  app.post("/referral/claim", subscriptionController.claimReferral);
}
