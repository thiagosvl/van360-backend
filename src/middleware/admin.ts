import { FastifyReply, FastifyRequest } from "fastify";
import { UserType } from "../types/enums.js";

export async function verifyAdmin(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const user = (request as any).user;

  if (!user) {
    return reply.status(401).send({ error: "Usuário não autenticado.", code: "AUTH_REQUIRED" });
  }

  const role = user.app_metadata?.role;

  if (role !== UserType.ADMIN) {
    return reply.status(403).send({ error: "Acesso restrito a administradores.", code: "ADMIN_ONLY" });
  }
}
