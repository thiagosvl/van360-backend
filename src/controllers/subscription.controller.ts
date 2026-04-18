import { FastifyReply, FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { logger } from "../config/logger.js";
import { z } from "zod";
import { ConfigKey } from "../types/enums.js";
import { createInvoiceSchema } from "../types/dtos/subscription.dto.js";

interface AuthenticatedRequest extends FastifyRequest {
  usuario_id: string;
}

export const subscriptionController = {
  async getMySubscription(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;

    try {
      const subscription = await subscriptionService.getOrCreateSubscription(userId);

      if (!subscription) {
        return reply.status(404).send({ error: "Assinatura não encontrada." });
      }

      return reply.send(subscription);
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao buscar assinatura.");
      return reply.status(500).send({ error: "Erro interno ao buscar assinatura." });
    }
  },

  async listPlans(_request: FastifyRequest, reply: FastifyReply) {
    try {
      const { getConfig } = await import("../services/configuracao.service.js");
      const [plans, isPromotionActive] = await Promise.all([
        subscriptionService.listPlans(),
        getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false").then(v => v === "true")
      ]);

      return reply.send({ plans, isPromotionActive });
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error }, "[SubscriptionController] Erro ao listar planos.");
      return reply.status(500).send({ error: "Erro interno ao listar planos." });
    }
  },

  async myInvoices(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;

    try {
      const invoices = await subscriptionService.getInvoices(userId);
      return reply.send(invoices);
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao buscar faturas.");
      return reply.status(500).send({ error: "Erro interno ao buscar faturas." });
    }
  },

  async createCheckout(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;

    try {
      const parsedBody = createInvoiceSchema.parse(request.body);
      const invoice = await subscriptionService.createInvoice(userId, parsedBody);
      return reply.status(201).send(invoice);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Dados inválidos.", details: err.issues });
      }
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao gerar checkout.");
      return reply.status(500).send({ error: error.message || "Erro interno ao gerar checkout." });
    }
  },

  async getReferralStatus(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;

    try {
      const summary = await subscriptionService.getReferralSummary(userId);
      return reply.send(summary);
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao buscar indicações.");
      return reply.status(500).send({ error: "Erro interno ao buscar indicações." });
    }
  },

  async listPaymentMethods(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    try {
      const methods = await subscriptionService.listPaymentMethods(userId);
      return reply.send(methods);
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao buscar métodos de pagamento.");
      return reply.status(500).send({ error: "Erro ao buscar métodos de pagamento." });
    }
  },

  async setDefaultPaymentMethod(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const authRequest = request as any as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    const { id } = request.params;

    try {
      await subscriptionService.updateDefaultPaymentMethod(userId, id);
      return reply.send({ success: true, message: "Método de pagamento padrão atualizado." });
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId, id }, "[SubscriptionController] Erro ao definir método de pagamento padrão.");
      return reply.status(500).send({ error: "Erro ao definir método de pagamento padrão." });
    }
  },

  async deletePaymentMethod(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    const authRequest = request as any as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    const { id } = request.params;

    try {
      await subscriptionService.deletePaymentMethod(userId, id);
      return reply.send({ success: true, message: "Método de pagamento removido." });
    } catch (err) {
      const error = err as Error;
      logger.error({ err: error, userId, id }, "[SubscriptionController] Erro ao deletar método de pagamento.");
      return reply.status(500).send({ error: "Erro ao deletar método de pagamento." });
    }
  },

  async claimReferral(request: FastifyRequest, reply: FastifyReply) {
    const authRequest = request as AuthenticatedRequest;
    const userId = authRequest.usuario_id;
    const bodySchema = z.object({
      phone: z.string().min(10).max(15),
    });

    try {
      const { phone } = bodySchema.parse(request.body);
      await subscriptionService.claimReferral(userId, phone);
      return reply.send({ success: true, message: "Indicação vinculada com sucesso!" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "Número de telefone inválido." });
      }
      const error = err as Error;
      logger.error({ err: error, userId }, "[SubscriptionController] Erro ao resgatar convite.");
      return reply.status(400).send({ error: error.message || "Erro interno ao resgatar convite." });
    }
  },
};
