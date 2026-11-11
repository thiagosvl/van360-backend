import crypto from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { redisClient } from "../config/redis.js";
import { logger } from "../config/logger.js";
import type { UserType } from "../types/enums.js";

export interface AuthProfileData {
  id: string;
  ativo?: boolean | null;
  tipo?: UserType;
  conta_pai_id?: string | null;
  veiculo_id?: string | null;
  config_contrato?: { usar_contratos?: boolean } | null;
  created_at?: string | null;
  [key: string]: unknown;
}

export interface CachedAuthData {
  user: User;
  profile: AuthProfileData;
  userVersion: number;
}

interface CachedResumoEnvelope<T> {
  version: number;
  data: T;
}

const DEFAULT_AUTH_CACHE_TTL_SECONDS = 300;
const SUBSCRIPTION_CACHE_TTL_SECONDS = 120;
const RESUMO_CACHE_TTL_SECONDS = 45;
const USER_VERSION_TTL_SECONDS = 86400;
const REDIS_OPERATION_TIMEOUT_MS = 250;

const inFlightAuthMap = new Map<string, Promise<{ user: User | null; profile: AuthProfileData | null; errorCode?: string; errorMessage?: string; status?: number }>>();
const inFlightResumoMap = new Map<string, Promise<unknown>>();

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

async function getResumoVersion(userId: string): Promise<number> {
  try {
    const versionStr = await withTimeout(redisClient.get(`resumo:ver:${userId}`));
    return versionStr ? parseInt(versionStr, 10) : 1;
  } catch {
    return 1;
  }
}

export const authCacheService = {
  async resolveAuthSingleflight(
    token: string,
    fetcher: () => Promise<{ user: User | null; profile: AuthProfileData | null; errorCode?: string; errorMessage?: string; status?: number }>
  ) {
    const tokenHash = getTokenHash(token);
    const existing = inFlightAuthMap.get(tokenHash);
    if (existing) {
      return existing;
    }

    const promise = fetcher().finally(() => {
      inFlightAuthMap.delete(tokenHash);
    });
    inFlightAuthMap.set(tokenHash, promise);
    return promise;
  },

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
      const authKey = `auth:uver:${userId}`;
      const resumoKey = `resumo:ver:${userId}`;
      await Promise.all([
        withTimeout(redisClient.incr(authKey)),
        withTimeout(redisClient.expire(authKey, USER_VERSION_TTL_SECONDS)),
        withTimeout(redisClient.incr(resumoKey)),
        withTimeout(redisClient.expire(resumoKey, USER_VERSION_TTL_SECONDS)),
      ]);
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

  async getCachedSubscription<T>(userId: string): Promise<T | null> {
    if (!userId) return null;
    try {
      const raw = await withTimeout(redisClient.get(`sub:user:${userId}`));
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao ler assinatura em cache");
      return null;
    }
  },

  async setCachedSubscription<T>(userId: string, data: T): Promise<void> {
    if (!userId || !data) return;
    try {
      await withTimeout(
        redisClient.setex(
          `sub:user:${userId}`,
          SUBSCRIPTION_CACHE_TTL_SECONDS,
          JSON.stringify(data)
        )
      );
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao salvar assinatura em cache");
    }
  },

  async invalidateSubscription(userId: string): Promise<void> {
    if (!userId) return;
    try {
      await withTimeout(redisClient.del(`sub:user:${userId}`));
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao invalidar assinatura em cache");
    }
  },

  async getCachedResumo<T>(userId: string, subKey: string): Promise<T | null> {
    if (!userId) return null;
    try {
      const [verStr, raw] = await withTimeout(
        redisClient.mget(`resumo:ver:${userId}`, `resumo:data:${userId}:${subKey}`)
      );
      if (!raw) return null;
      const envelope = JSON.parse(raw) as CachedResumoEnvelope<T>;
      const currentVersion = verStr ? parseInt(verStr, 10) : 1;
      if (envelope.version !== currentVersion) {
        return null;
      }
      return envelope.data;
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao ler resumo em cache");
      return null;
    }
  },

  async setCachedResumo<T>(userId: string, subKey: string, data: T): Promise<void> {
    if (!userId || !data) return;
    try {
      const version = await getResumoVersion(userId);
      const envelope: CachedResumoEnvelope<T> = { version, data };
      await withTimeout(
        redisClient.setex(
          `resumo:data:${userId}:${subKey}`,
          RESUMO_CACHE_TTL_SECONDS,
          JSON.stringify(envelope)
        )
      );
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao salvar resumo em cache");
    }
  },

  async resolveResumoSingleflight<T>(
    userId: string,
    subKey: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const flightKey = `${userId}:${subKey}`;
    const existing = inFlightResumoMap.get(flightKey);
    if (existing) {
      return existing as Promise<T>;
    }
    const promise = fetcher().finally(() => {
      inFlightResumoMap.delete(flightKey);
    });
    inFlightResumoMap.set(flightKey, promise);
    return promise;
  },

  async invalidateUserResumo(userId?: string | null): Promise<void> {
    if (!userId) return;
    try {
      const key = `resumo:ver:${userId}`;
      await withTimeout(redisClient.incr(key));
      await withTimeout(redisClient.expire(key, USER_VERSION_TTL_SECONDS));
    } catch (err) {
      logger.warn({ err, userId }, "[AuthCache] Falha ao invalidar resumo em cache");
    }
  },
};
