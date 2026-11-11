import { supabaseAdmin } from "../config/supabase.js";
import { redisClient } from "../config/redis.js";

const CONFIG_REDIS_KEY = "config:internal:all";
const CONFIG_TTL_SECONDS = 300;
const MEMORY_TTL_MS = 60_000;

let memoryCache: { data: Record<string, string>; expiresAt: number } | null = null;
let inFlightPromise: Promise<Record<string, string> | null> | null = null;

async function getAllConfigsCached(): Promise<Record<string, string> | null> {
    const now = Date.now();
    if (memoryCache && memoryCache.expiresAt > now) {
        return memoryCache.data;
    }

    if (inFlightPromise) {
        return inFlightPromise;
    }

    inFlightPromise = (async () => {
        try {
            const raw = await redisClient.get(CONFIG_REDIS_KEY).catch(() => null);
            if (raw) {
                const parsed = JSON.parse(raw) as Record<string, string>;
                memoryCache = { data: parsed, expiresAt: Date.now() + MEMORY_TTL_MS };
                return parsed;
            }
        } catch {}

        const { data, error } = await supabaseAdmin
            .from("configuracao_interna")
            .select("chave, valor");

        if (error || !data) {
            return null;
        }

        const map: Record<string, string> = {};
        for (const row of data) {
            map[row.chave] = row.valor;
        }

        memoryCache = { data: map, expiresAt: Date.now() + MEMORY_TTL_MS };
        await redisClient.setex(CONFIG_REDIS_KEY, CONFIG_TTL_SECONDS, JSON.stringify(map)).catch(() => {});
        return map;
    })().finally(() => {
        inFlightPromise = null;
    });

    return inFlightPromise;
}

export const configuracaoRepository = {
    async getByKey(key: string) {
        const all = await getAllConfigsCached();
        if (all && key in all) {
            return { data: { valor: all[key] }, error: null };
        }

        return supabaseAdmin
            .from("configuracao_interna")
            .select("valor")
            .eq("chave", key)
            .single();
    },

    async getManyByKeys(keys: string[]): Promise<Record<string, string>> {
        const all = await getAllConfigsCached();
        if (all) {
            const result: Record<string, string> = {};
            for (const k of keys) {
                if (k in all) {
                    result[k] = all[k];
                }
            }
            return result;
        }

        const { data, error } = await supabaseAdmin
            .from("configuracao_interna")
            .select("chave, valor")
            .in("chave", keys);

        if (error) {
            throw error;
        }

        const configMap: Record<string, string> = {};
        (data || []).forEach((row: { chave: string; valor: string }) => {
            configMap[row.chave] = row.valor;
        });
        return configMap;
    },

    async invalidateCache(): Promise<void> {
        memoryCache = null;
        await redisClient.del(CONFIG_REDIS_KEY).catch(() => {});
    }
};
