import { FastifyReply, FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { logger } from "../config/logger.js";

/**
 * Middleware para bloquear ações de escrita (POST, PUT, DELETE, PATCH)
 * caso a assinatura SaaS do motorista esteja bloqueada/expirada.
 */
export async function checkSubscriptionAccess(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const userId = (request as any).usuario_id;
  const method = request.method;

  // 1. Permitir leituras (GET) sempre
  if (method === "GET") return;

  // 2. Ignorar rotas de pagamento e assinatura
  const url = request.url;
  if (url.includes("/subscriptions") || url.includes("/payments")) return;

  if (!userId) return;

  try {
    const isBlocked = await subscriptionService.isBlocked(userId);

    if (isBlocked) {
      logger.warn({ userId, url, method }, "[SubscriptionMiddleware] Ação bloqueada — Assinatura SaaS EXPIRADA.");
      
      return reply.status(403).send({
        error: "Acesso bloqueado. Sua assinatura SaaS expirou.",
        code: "SAAS_EXPIRED",
        message: "Sua conta está em modo leitura. Regularize seu pagamento para continuar criando cobranças e gerenciando passageiros."
      });
    }
  } catch (err) {
    logger.error({ err, userId }, "[SubscriptionMiddleware] Erro ao validar assinatura.");
    // Em caso de erro na validação, permitimos para evitar quebra do sistema?
    // Ou bloqueamos por segurança? Vou permitir por enquanto p/ não travar o driver por erro interno.
    return;
  }
}
