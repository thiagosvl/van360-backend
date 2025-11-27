import { FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../config/supabase";

export async function verifySupabaseJWT(
  request: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return reply.status(401).send({ error: "Token ausente ou inválido" });
    }

    const token = authHeader.split(" ")[1];
    const { data: user, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user.user) {
      return reply.status(401).send({ error: "Token inválido" });
    }

    (request as any).user = user.user;

  } catch (err: any) {
    return reply.status(401).send({ error: err.message });
  }
}
