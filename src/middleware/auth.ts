import { FastifyReply, FastifyRequest } from "fastify";
import { supabaseAdmin } from "../config/supabase.js";

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

    // SECURITY: Validate if the user is explicitly active in the database
    // This prevents access even if the token is valid (e.g. inactive user)
    const { data: profile } = await supabaseAdmin
        .from("usuarios")
        .select("ativo")
        .eq("auth_uid", user.user.id)
        .maybeSingle();

    if (profile && profile.ativo === false) {
        return reply.status(403).send({ error: "Sua conta está inativa. Entre em contato com o suporte." });
    }

    (request as any).user = user.user;

  } catch (err: any) {
    return reply.status(401).send({ error: err.message });
  }
}
