import { isTransientError } from "./retry.utils.js";
import { logger } from "../config/logger.js";

const RETRY_STATUS_CODES = new Set([502, 503, 504]);
const MAX_FETCH_RETRIES = 2;
const INITIAL_DELAY_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const customSupabaseFetch: typeof fetch = async (input, init) => {
  let attempt = 0;
  let delay = INITIAL_DELAY_MS;

  while (true) {
    try {
      const response = await fetch(input, init);

      if (RETRY_STATUS_CODES.has(response.status) && attempt < MAX_FETCH_RETRIES) {
        attempt++;
        const jitter = Math.floor(Math.random() * 100);
        const waitTime = delay + jitter;

        logger.warn(
          { status: response.status, attempt, waitTime, url: typeof input === "string" ? input : input.toString() },
          "[SupabaseFetch] Status transitório detectado no Supabase. Retentando requisição..."
        );

        await sleep(waitTime);
        delay *= 2;
        continue;
      }

      return response;
    } catch (error) {
      attempt++;

      if (attempt <= MAX_FETCH_RETRIES && isTransientError(error)) {
        const jitter = Math.floor(Math.random() * 100);
        const waitTime = delay + jitter;

        logger.warn(
          { error: error instanceof Error ? error.message : String(error), attempt, waitTime },
          "[SupabaseFetch] Falha de conexão transitória com o Supabase. Retentando requisição..."
        );

        await sleep(waitTime);
        delay *= 2;
        continue;
      }

      throw error;
    }
  }
};
