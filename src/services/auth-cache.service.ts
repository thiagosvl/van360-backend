import crypto from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { redisClient } from "../config/redis.js";
import { logger } from "../config/logger.js";
import type { UserType } from "../types/enums.js";

export interface AuthProfileData {
  id: string;
  ativo: boolean | null;
  tipo: UserType;
  conta_pai_id: string | null;
  veiculo_id: string | null;
  [key: string]: unknown;
}

export interface CachedAuthData {
  user: User;
  profile: AuthProfileData;
  userVersion: number;
}

const DEFAULT_AUTH_CACHE_TTL_SECONDS = 60;
const USER_VERSION_TTL_SECONDS = 86400;
const REDIS_OPERATION_TIMEOUT_MS = 250;

function withTimeout<T>(promise: Promise<T>, ms = REDIS_OPERATION_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis timeout after ${ms}ms`));
    }, ms);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

function getTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

async function getUserVersion(userId: string): Promise<number> {
  try {
    const versionStr = await withTimeout(redisClient.get(`auth:uver:${userId}`));
    return versionStr ? parseInt(versionStr, 10) : 1;
  } catch {
    return 1;
  }
}

export const authCacheService = {
  async getCachedAuth(token: string): Promise<CachedAuthData | null> {
    try {
      const tokenHash = getTokenHash(token);
      const cachedRaw = await withTimeout(redisClient.get(`auth:token:${tokenHash}`));
      if (!cachedRaw) {
        return null;
      }

      const cached = JSON.parse(cachedRaw) as CachedAuthData;
      if (!cached?.profile?.id || !cached?.user?.id) {
        return null;
      }

      const currentVersion = await getUserVersion(cached.profile.id);
      if (cached.userVersion !== currentVersion) {
        await withTimeout(redisClient.del(`auth:token:${tokenHash}`)).catch(() => {});
        return null;
      }

      return cached;
    } catch (err) {
      logger.warn({ err }, "[AuthCache] Falha ao recuperar sessão em cache");
      return null;
    }
  },

  async setCachedAuth(
    token: string,
    user: User,
    profile: AuthProfileData
  ): Promise<void> {
    try {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expSeconds = getTokenExpiry(token);
      let ttl = DEFAULT_AUTH_CACHE_TTL_SECONDS;

      if (expSeconds) {
        const remainingSeconds = expSeconds - nowSeconds;
        if (remainingSeconds <= 0) {
          return;
        }
        ttl = Math.min(DEFAULT_AUTH_CACHE_TTL_SECONDS, remainingSeconds);
      }

      const currentVersion = await getUserVersion(profile.id);
      const dataToCache: CachedAuthData = {
        user,
        profile,
        userVersion: currentVersion,
      };

      const tokenHash = getTokenHash(token);
      await withTimeout(
        redisClient.setex(
          `auth:token:${tokenHash}`,
          ttl,
          JSON.stringify(dataToCache)
        )
      );
    } catch (err) {
      logger.warn({ err }, "[AuthCache] Falha ao salvar sessão em cache");
    }
  },

  async invalidateUserAuth(userId: string): Promise<void> {
    if (!userId) {
      return;
    }
    try {
      const key = `auth:uver:${userId}`;
      await withTimeout(redisClient.incr(key));
      await withTimeout(redisClient.expire(key, USER_VERSION_TTL_SECONDS));
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao invalidar versão de sessão do usuário");
    }
  },

  async invalidateToken(token: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      const tokenHash = getTokenHash(token);
      await withTimeout(redisClient.del(`auth:token:${tokenHash}`));
    } catch (err) {
      logger.warn({ err }, "[AuthCache] Falha ao invalidar token no cache");
    }
  },
};
