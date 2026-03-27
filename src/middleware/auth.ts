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
    
    // 1. Validar JWT com Supabase Auth
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      const isUserNotFound = authError?.message?.toLowerCase().includes("user not found");
      
      return reply.status(401).send({ 
        error: isUserNotFound ? "Usuário não encontrado no sistema de autenticação" : "Sessão inválida ou expirada", 
        code: isUserNotFound ? "AUTH_USER_NOT_FOUND" : "AUTH_JWT_INVALID" 
      });
    }

    const userId = user.id;

    // 2. Verificar existência e status do perfil no banco de dados
    const { data: profile, error: profileError } = await supabaseAdmin
        .from("usuarios")
        .select("id, ativo")
        .eq("id", userId)
        .maybeSingle();

    if (profileError) {
      console.error("[Auth] Database error during verification:", profileError.message);
      return reply.status(500).send({ error: "Erro interno ao validar perfil", code: "AUTH_DB_ERROR" });
    }

    if (!profile) {
      return reply.status(401).send({ 
        error: "Perfil não registrado no sistema", 
        code: "AUTH_PROFILE_NOT_FOUND" 
      });
    }

    if (profile.ativo === false) {
      return reply.status(403).send({ 
        error: "Esta conta está desativada", 
        code: "AUTH_USER_INACTIVE" 
      });
    }

    (request as any).user = user;
    (request as any).usuario_id = profile.id;

  } catch (err: any) {
    return reply.status(401).send({ error: "Falha na autenticação", code: "AUTH_UNEXPECTED_ERROR" });
  }
}

export { verifySupabaseJWT as authenticate };

