export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

const TRANSIENT_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

const TRANSIENT_ERROR_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

export function isTransientError(error: unknown): boolean {
  if (!error) return false;

  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>;

    if (typeof errObj.status === "number" && TRANSIENT_STATUS_CODES.has(errObj.status)) {
      return true;
    }

    if (typeof errObj.statusCode === "number" && TRANSIENT_STATUS_CODES.has(errObj.statusCode)) {
      return true;
    }

    if (typeof errObj.code === "string" && TRANSIENT_ERROR_CODES.has(errObj.code)) {
      return true;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  const lowerMsg = message.toLowerCase();

  return (
    lowerMsg.includes("gateway timeout") ||
    lowerMsg.includes("bad gateway") ||
    lowerMsg.includes("service unavailable") ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("network timeout") ||
    lowerMsg.includes("socket hang up") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("etimedout")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const initialDelayMs = options.initialDelayMs ?? 300;
  const maxDelayMs = options.maxDelayMs ?? 3000;
  const backoffFactor = options.backoffFactor ?? 2;
  const shouldRetry = options.shouldRetry ?? isTransientError;

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt++;

      if (attempt > maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const jitter = Math.floor(Math.random() * 100);
      const delay = Math.min(currentDelay + jitter, maxDelayMs);

      if (options.onRetry) {
        options.onRetry(error, attempt, delay);
      }

      await sleep(delay);
      currentDelay *= backoffFactor;
    }
  }
}
