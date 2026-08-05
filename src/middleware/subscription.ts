import { FastifyReply, FastifyRequest } from "fastify";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { logger } from "../config/logger.js";

import { UserType } from "../types/enums.js";

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
  if (user?.app_metadata?.role === UserType.ADMIN) return;

  if (!userId) return;

  const targetUserId = (request as any).data_owner_id || userId;
  const isSubAccount = Boolean((request as any).profile?.conta_pai_id);

  try {
    const isBlocked = await subscriptionService.isBlocked(targetUserId);

    if (isBlocked) {
      logger.warn({ userId, targetUserId, url, method }, "[SubscriptionMiddleware] Ação bloqueada — Assinatura SaaS da frota EXPIRADA.");

      return reply.status(403).send({
        error: isSubAccount
          ? "Acesso temporariamente suspenso"
          : "Acesso bloqueado. Sua assinatura expirou.",
        code: "SAAS_EXPIRED",
        message: isSubAccount
          ? "O acesso à sua frota está temporariamente suspenso. Por favor, entre em contato com o seu gestor."
          : "Sua conta está em modo leitura. Regularize seu pagamento para continuar criando cobranças e gerenciando passageiros."
      });
    }
  } catch (err) {
    logger.error({ err, userId }, "[SubscriptionMiddleware] Erro ao validar assinatura.");
    return;
  }
}
