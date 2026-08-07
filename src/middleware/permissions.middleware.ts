import { FastifyReply, FastifyRequest } from "fastify";
import { hasPermission, PermissionKey } from "../config/permissions.js";
import { UserType } from "../types/enums.js";

export function requirePermission(...permissions: PermissionKey[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user;
    const profile = request.profile;
    const role = (user?.app_metadata?.role || profile?.tipo || UserType.MOTORISTA) as UserType;

    const allowed = permissions.some((p) => hasPermission(role, p));
    if (!allowed) {
      return reply.status(403).send({
        error: "Acesso negado",
        code: "PERMISSION_DENIED",
        message: `Você não possui permissão para executar esta ação (${permissions.join(", ")}).`
      });
    }
  };
}
