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
    // console.log("[AuthMiddleware] Verifying token:", token.substring(0, 10) + "...");
    const { data: user, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user.user) {
      console.error("[AuthMiddleware] JWT Validation Failed:", {
        message: error?.message,
        name: error?.name,
        status: (error as any)?.status
      });
      return reply.status(401).send({ error: "Token inválido" });
    }

    console.log("[AuthMiddleware] User verified:", user.user.id);

    // SECURITY: Validate if the user is explicitly active in the database
    // This prevents access even if the token is valid (e.g. inactive user)
    const { data: profile, error: profileError } = await supabaseAdmin
        .from("usuarios")
        .select("ativo")
        .eq("auth_uid", user.user.id)
        .maybeSingle();

    if (profileError) {
        console.error("[AuthMiddleware] Profile Query Error:", profileError.message);
    }

    if (!profile) {
        console.error("[AuthMiddleware] Profile NOT FOUND for auth_uid:", user.user.id);
        return reply.status(401).send({ error: "Perfil não encontrado. Faça login novamente." });
    }

    if (profile.ativo === false) {
        return reply.status(403).send({ error: "Sua conta está inativa. Entre em contato com o suporte." });
    }

    (request as any).user = user.user;

  } catch (err: any) {
    console.error("[AuthMiddleware] Unexpected Error:", err);
    return reply.status(401).send({ error: err.message });
  }
}

export { verifySupabaseJWT as authenticate };

