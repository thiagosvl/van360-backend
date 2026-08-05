import { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, PermissionKey } from "../config/permissions.js";
import { UserType } from "../types/enums.js";

export function requirePermission(permission: PermissionKey) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;
    const profile = (request as any).profile;
    const role = (user?.app_metadata?.role || profile?.tipo || UserType.MOTORISTA) as UserType;

    if (!hasPermission(role, permission)) {
      return reply.status(403).send({
        error: "Acesso negado",
        code: "PERMISSION_DENIED",
        message: `Você não possui permissão para executar esta ação (${permission}).`
      });
    }
  };
}
