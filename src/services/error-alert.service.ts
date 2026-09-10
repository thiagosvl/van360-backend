import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisClient } from "../config/redis.js";
import { addToTelegramQueue } from "../queues/telegram.queue.js";

interface HttpErrorAlertContext {
  error: unknown;
  method: string;
  url: string;
  statusCode: number;
  userId?: string;
}

interface FatalErrorAlertContext {
  error: unknown;
  origin: string;
}

const COOLDOWN_SECONDS = 600;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Erro interno desconhecido";
}

function resolveErrorStack(error: unknown): string {
  if (error instanceof Error && error.stack) {
    const lines = error.stack.split("\n").slice(0, 5).join("\n");
    return lines.slice(0, 350);
  }
  return "Sem stack trace disponível";
}

export const errorAlertService = {
  async notifyHttpError(ctx: HttpErrorAlertContext): Promise<void> {
    try {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
        return;
      }

      const errorMessage = resolveErrorMessage(ctx.error);
      const stack = resolveErrorStack(ctx.error);
      const hash = crypto
        .createHash("md5")
        .update(`${ctx.method}:${ctx.url}:${errorMessage}`)
        .digest("hex");

      const throttleKey = `alert:error:${hash}`;

      try {
        const isThrottled = await redisClient.get(throttleKey);
        if (isThrottled) {
          logger.info({ throttleKey, url: ctx.url }, "[ErrorAlertService] Alerta de erro silenciado pelo cooldown");
          return;
        }
        await redisClient.setex(throttleKey, COOLDOWN_SECONDS, "1");
      } catch (redisErr) {
        logger.warn({ error: resolveErrorMessage(redisErr) }, "[ErrorAlertService] Falha ao verificar cooldown no Redis");
      }

      const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const environment = env.NODE_ENV;
      const userDisplay = ctx.userId ? `<code>${escapeHtml(ctx.userId)}</code>` : "Anônimo / Não autenticado";

      const message = [
        `🚨 <b>[ERRO ${ctx.statusCode} - API VAN360]</b>`,
        "",
        `<b>Ambiente:</b> <code>${environment}</code>`,
        `<b>Rota:</b> <code>${escapeHtml(ctx.method)} ${escapeHtml(ctx.url)}</code>`,
        `<b>Usuário:</b> ${userDisplay}`,
        `<b>Horário:</b> ${timestamp}`,
        `<b>Mensagem:</b> <code>${escapeHtml(errorMessage)}</code>`,
        "",
        "<b>Stack Trace:</b>",
        `<pre>${escapeHtml(stack)}</pre>`,
      ].join("\n");

      await addToTelegramQueue({
        message,
        context: "http-error-alert"
      }, `alert-http-${hash}-${Date.now()}`);
    } catch (dispatchError) {
      logger.error({ error: resolveErrorMessage(dispatchError) }, "[ErrorAlertService] Falha ao despachar alerta HTTP");
    }
  },

  async notifyFatalError(ctx: FatalErrorAlertContext): Promise<void> {
    try {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
        return;
      }

      const errorMessage = resolveErrorMessage(ctx.error);
      const stack = resolveErrorStack(ctx.error);
      const hash = crypto
        .createHash("md5")
        .update(`${ctx.origin}:${errorMessage}`)
        .digest("hex");

      const throttleKey = `alert:fatal:${hash}`;

      try {
        const isThrottled = await redisClient.get(throttleKey);
        if (isThrottled) {
          return;
        }
        await redisClient.setex(throttleKey, COOLDOWN_SECONDS, "1");
      } catch (redisErr) {
        logger.warn({ error: resolveErrorMessage(redisErr) }, "[ErrorAlertService] Falha ao verificar cooldown no Redis");
      }

      const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const environment = env.NODE_ENV;

      const message = [
        `💥 <b>[FALHA CRÍTICA - PROCESSO NODE]</b>`,
        "",
        `<b>Ambiente:</b> <code>${environment}</code>`,
        `<b>Origem:</b> <code>${escapeHtml(ctx.origin)}</code>`,
        `<b>Horário:</b> ${timestamp}`,
        `<b>Erro:</b> <code>${escapeHtml(errorMessage)}</code>`,
        "",
        "<b>Stack Trace:</b>",
        `<pre>${escapeHtml(stack)}</pre>`,
      ].join("\n");

      await addToTelegramQueue({
        message,
        context: "fatal-error-alert"
      }, `alert-fatal-${hash}-${Date.now()}`);
    } catch (dispatchError) {
      logger.error({ error: resolveErrorMessage(dispatchError) }, "[ErrorAlertService] Falha ao despachar alerta fatal");
    }
  }
};
