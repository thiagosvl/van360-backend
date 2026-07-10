import { FastifyReply, FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { logger } from "../config/logger.js";

const EXEMPTED_ROUTES = [
  "/api/admin",
  "/api/subscriptions",
  "/api/payments",
  "/api/usuarios" // Permite atualizar dados do próprio perfil (canal aquisição, pix, etc)
];

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

  if (method === "GET") return;

  const url = request.url;
  const isExempted = EXEMPTED_ROUTES.some(route => url.startsWith(route));

  if (isExempted) {
    return;
  }

  const user = (request as any).user;
  if (user?.app_metadata?.role === "admin") return;

  if (!userId) return;

  try {
    const isBlocked = await subscriptionService.isBlocked(userId);

    if (isBlocked) {
      logger.warn({ userId, url, method }, "[SubscriptionMiddleware] Ação bloqueada — Assinatura SaaS EXPIRADA.");

      return reply.status(403).send({
        error: "Acesso bloqueado. Sua assinatura expirou.",
        code: "SAAS_EXPIRED",
        message: "Sua conta está em modo leitura. Regularize seu pagamento para continuar criando cobranças e gerenciando passageiros."
      });
    }
  } catch (err) {
    logger.error({ err, userId }, "[SubscriptionMiddleware] Erro ao validar assinatura.");
    return;
  }
}
