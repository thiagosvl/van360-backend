import { FastifyReply, FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { subscriptionBillingService } from "../services/subscriptions/subscription-billing.service.js";
import { subscriptionPricingService } from "../services/subscriptions/subscription-pricing.service.js";
import { subscriptionReferralService } from "../services/subscriptions/subscription-referral.service.js";
import { AppError } from "../errors/AppError.js";
import { createInvoiceSchema } from "../types/dtos/subscription.dto.js";

interface AuthenticatedRequest extends FastifyRequest {
  usuario_id: string;
}

export const subscriptionController = {
  async getMySubscription(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const targetUserId = authRequest.data_owner_id || authRequest.usuario_id;

    const subscription = await subscriptionService.getOrCreateSubscription(targetUserId);

    if (!subscription) {
      throw new AppError("Assinatura não encontrada.", 404);
    }

    return reply.send(subscription);
  },

  async listPlans(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as Partial<AuthenticatedRequest>;
    const targetUserId = authRequest.data_owner_id || authRequest.usuario_id;
    const result = await subscriptionPricingService.getPlansWithPricing(targetUserId);

    return reply.send(result);
  },

  async myInvoices(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    const query = request.query as { page?: string; limit?: string };
    const page = query.page ? parseInt(query.page, 10) : undefined;
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;

    const invoices = await subscriptionBillingService.getInvoices(userId, page, limit);
    return reply.send(invoices);
  },

  async cancelSubscription(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const targetUserId = authRequest.data_owner_id || authRequest.usuario_id;

    await subscriptionService.cancelSubscription(targetUserId);
    return reply.send({ success: true, message: "Assinatura cancelada com sucesso." });
  },

  async createCheckout(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const targetUserId = authRequest.data_owner_id || authRequest.usuario_id;

    const parsedBody = createInvoiceSchema.parse(request.body);
    const invoice = await subscriptionBillingService.createInvoice(targetUserId, parsedBody);
    return reply.status(201).send(invoice);
  },

  async getReferralStatus(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;

    const summary = await subscriptionReferralService.getReferralSummary(userId);
    return reply.send(summary);
  },

  async listPaymentMethods(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    const methods = await subscriptionBillingService.listPaymentMethods(userId);
    return reply.send(methods);
  },

  async setDefaultPaymentMethod(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.usuario_id!;
    const { id } = request.params as { id: string };

    await subscriptionBillingService.updateDefaultPaymentMethod(userId, id);
    return reply.send({ success: true, message: "Método de pagamento padrão atualizado." });
  },

  async deletePaymentMethod(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.usuario_id!;
    const { id } = request.params as { id: string };

    await subscriptionBillingService.deletePaymentMethod(userId, id);
    return reply.send({ success: true, message: "Método de pagamento removido." });
  },
};
