import crypto from "node:crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisClient } from "../config/redis.js";
import { addToTelegramQueue } from "../queues/telegram.queue.js";
import { NotificationChannelEnum, PaymentProvider } from "../types/enums.js";
import { extractErrorMessage, extractErrorStack } from "../utils/error.utils.js";

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

interface NotificationErrorAlertContext {
  channel: NotificationChannelEnum;
  error: unknown;
  statusCode?: number;
  eventName?: string;
  templateName?: string;
  destinatario?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

interface PaymentErrorAlertContext {
  provider: PaymentProvider;
  error: unknown;
  externalId?: string;
  paymentMethod?: string;
  amount?: string;
  details?: Record<string, string | number | boolean | null | undefined>;
}

const COOLDOWN_SECONDS = 600;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resolveErrorMessage(error: unknown): string {
  return extractErrorMessage(error);
}

function resolveErrorStack(error: unknown): string {
  return extractErrorStack(error);
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

      const throttleKey = `alert:http:${hash}`;

      try {
        const isThrottled = await redisClient.get(throttleKey);
        if (isThrottled) {
          logger.info({ throttleKey, url: ctx.url }, "[ErrorAlertService] Alerta HTTP silenciado pelo cooldown");
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
  },

  async notifyNotificationError(ctx: NotificationErrorAlertContext): Promise<void> {
    try {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
        return;
      }

      const errorMessage = resolveErrorMessage(ctx.error);
      const hash = crypto
        .createHash("md5")
        .update(`notif:${ctx.channel}:${ctx.eventName || ""}:${errorMessage}`)
        .digest("hex");

      const throttleKey = `alert:notification:${hash}`;

      try {
        const isThrottled = await redisClient.get(throttleKey);
        if (isThrottled) {
          logger.info({ throttleKey, channel: ctx.channel }, "[ErrorAlertService] Alerta de notificação silenciado pelo cooldown");
          return;
        }
        await redisClient.setex(throttleKey, COOLDOWN_SECONDS, "1");
      } catch (redisErr) {
        logger.warn({ error: resolveErrorMessage(redisErr) }, "[ErrorAlertService] Falha ao verificar cooldown no Redis");
      }

      const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const environment = env.NODE_ENV;

      const lines = [
        `🚨 <b>[FALHA DE NOTIFICAÇÃO - ${escapeHtml(ctx.channel)}]</b>`,
        "",
        `<b>Ambiente:</b> <code>${environment}</code>`,
        `<b>Canal:</b> <code>${escapeHtml(ctx.channel)}</code>`,
      ];

      if (ctx.statusCode) {
        lines.push(`<b>Status HTTP:</b> ${ctx.statusCode}`);
      }

      if (ctx.eventName) {
        lines.push(`<b>Evento:</b> <code>${escapeHtml(ctx.eventName)}</code>`);
      }

      if (ctx.templateName) {
        lines.push(`<b>Template:</b> <code>${escapeHtml(ctx.templateName)}</code>`);
      }

      if (ctx.destinatario) {
        lines.push(`<b>Destinatário:</b> <code>${escapeHtml(ctx.destinatario)}</code>`);
      }

      lines.push(`<b>Horário:</b> ${timestamp}`);
      lines.push(`<b>Erro:</b> <code>${escapeHtml(errorMessage)}</code>`);

      if (ctx.details && Object.keys(ctx.details).length > 0) {
        lines.push("");
        lines.push("<b>Detalhes:</b>");
        for (const [key, value] of Object.entries(ctx.details)) {
          if (value !== undefined && value !== null) {
            lines.push(`• <b>${escapeHtml(key)}:</b> <code>${escapeHtml(String(value))}</code>`);
          }
        }
      }

      const message = lines.join("\n");

      await addToTelegramQueue({
        message,
        context: "notification-error-alert"
      }, `alert-notif-${hash}-${Date.now()}`);
    } catch (dispatchError) {
      logger.error({ error: resolveErrorMessage(dispatchError) }, "[ErrorAlertService] Falha ao despachar alerta de notificação");
    }
  },

  async notifyPaymentError(ctx: PaymentErrorAlertContext): Promise<void> {
    try {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ADMIN_CHAT_ID) {
        return;
      }

      const errorMessage = resolveErrorMessage(ctx.error);
      const hash = crypto
        .createHash("md5")
        .update(`payment:${ctx.provider}:${errorMessage}`)
        .digest("hex");

      const throttleKey = `alert:payment:${hash}`;

      try {
        const isThrottled = await redisClient.get(throttleKey);
        if (isThrottled) {
          logger.info({ throttleKey, provider: ctx.provider }, "[ErrorAlertService] Alerta de pagamento silenciado pelo cooldown");
          return;
        }
        await redisClient.setex(throttleKey, COOLDOWN_SECONDS, "1");
      } catch (redisErr) {
        logger.warn({ error: resolveErrorMessage(redisErr) }, "[ErrorAlertService] Falha ao verificar cooldown no Redis");
      }

      const timestamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      const environment = env.NODE_ENV;
      const providerUpper = ctx.provider.toUpperCase();

      const lines = [
        `💳 <b>[FALHA DE PAGAMENTO - ${escapeHtml(providerUpper)}]</b>`,
        "",
        `<b>Ambiente:</b> <code>${environment}</code>`,
        `<b>Provedor:</b> <code>${escapeHtml(providerUpper)}</code>`,
      ];

      if (ctx.externalId) {
        lines.push(`<b>Fatura / External ID:</b> <code>${escapeHtml(ctx.externalId)}</code>`);
      }

      if (ctx.paymentMethod) {
        lines.push(`<b>Método:</b> <code>${escapeHtml(ctx.paymentMethod)}</code>`);
      }

      if (ctx.amount) {
        lines.push(`<b>Valor:</b> <code>${escapeHtml(ctx.amount)}</code>`);
      }

      lines.push(`<b>Horário:</b> ${timestamp}`);
      lines.push(`<b>Erro:</b> <code>${escapeHtml(errorMessage)}</code>`);

      if (ctx.details && Object.keys(ctx.details).length > 0) {
        lines.push("");
        lines.push("<b>Detalhes:</b>");
        for (const [key, value] of Object.entries(ctx.details)) {
          if (value !== undefined && value !== null) {
            lines.push(`• <b>${escapeHtml(key)}:</b> <code>${escapeHtml(String(value))}</code>`);
          }
        }
      }

      const message = lines.join("\n");

      await addToTelegramQueue({
        message,
        context: "payment-error-alert"
      }, `alert-pay-${hash}-${Date.now()}`);
    } catch (dispatchError) {
      logger.error({ error: resolveErrorMessage(dispatchError) }, "[ErrorAlertService] Falha ao despachar alerta de pagamento");
    }
  }
};
