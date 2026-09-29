import { FastifyReply, FastifyRequest } from "fastify";
import type { User } from "@supabase/supabase-js";
import { authProvider } from "../services/providers/auth.provider.js";
import { authRepository } from "../repositories/auth.repository.js";
import { authCacheService, type AuthProfileData } from "../services/auth-cache.service.js";

import { UserType } from "../types/enums.js";
import { isSubConta, getDonoContaId } from "../utils/user.utils.js";

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

    let user: User | null = null;
    let profile: AuthProfileData | null = null;

    const cached = await authCacheService.getCachedAuth(token);
    if (cached) {
      user = cached.user;
      profile = cached.profile;
    } else {
      const { data: { user: fetchedUser }, error: authError } = await authProvider.getUser(token);

      if (authError || !fetchedUser) {
        const isUserNotFound = authError?.message?.toLowerCase().includes("user not found");

        return reply.status(401).send({
          error: isUserNotFound ? "Usuário não encontrado no sistema de autenticação" : "Sessão inválida ou expirada",
          code: isUserNotFound ? "AUTH_USER_NOT_FOUND" : "AUTH_JWT_INVALID"
        });
      }

      user = fetchedUser;

      const { data: fetchedProfile, error: profileError } = await authRepository.getAuthProfile(user.id);

      if (profileError) {
        throw profileError;
      }

      if (!fetchedProfile) {
        return reply.status(401).send({
          error: "Perfil não registrado no sistema",
          code: "AUTH_PROFILE_NOT_FOUND"
        });
      }

      profile = fetchedProfile as AuthProfileData;

      if (profile.ativo !== false) {
        await authCacheService.setCachedAuth(token, user, profile);
      }
    }

    if (!user || !profile) {
      return reply.status(401).send({
        error: "Falha na autenticação do usuário",
        code: "AUTH_UNEXPECTED_ERROR",
      });
    }

    if (profile.ativo === false) {
      return reply.status(403).send({
        error: "Esta conta está desativada",
        code: "AUTH_USER_INACTIVE"
      });
    }

    const isSubAccount = isSubConta(profile);

    request.user = {
      ...user,
      app_metadata: {
        ...user.app_metadata,
        role: profile.tipo,
      },
    };
    request.profile = profile;
    request.usuario_id = profile.id;
    request.data_owner_id = getDonoContaId(profile) || profile.id;
    request.assigned_veiculo_id = isSubAccount ? (profile.veiculo_id || null) : null;

    if (isSubAccount && profile.conta_pai_id) {
      const bodyContaPai = (request.body as Record<string, unknown> | undefined)?.conta_pai_id;
      const queryContaPai = (request.query as Record<string, unknown> | undefined)?.conta_pai_id;
      const paramContaPai = (request.params as Record<string, unknown> | undefined)?.conta_pai_id;
      const attemptedContaPai = bodyContaPai || queryContaPai || paramContaPai;

      if (attemptedContaPai && attemptedContaPai !== profile.conta_pai_id) {
        return reply.status(403).send({
          error: "Operação negada: sub-conta não pode manipular dados de outro usuario",
          code: "FORBIDDEN_CONTA_PAI_MISMATCH"
        });
      }
    }

  } catch (err: unknown) {
    return reply.status(401).send({ error: "Falha na autenticação", code: "AUTH_UNEXPECTED_ERROR" });
  }
}

export { verifySupabaseJWT as authenticate };

