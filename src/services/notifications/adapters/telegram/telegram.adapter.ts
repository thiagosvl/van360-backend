import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { addToTelegramQueue } from "../../../../queues/telegram.queue.js";
import { TelegramMapper } from "./telegram.mapper.js";
import { env } from "../../../../config/env.js";
import { logger } from "../../../../config/logger.js";
import { NotificationOptions } from "../../notification.service.js";

export class TelegramAdapter implements NotificationProviderPort {
    getProviderId(): string {
        return "TELEGRAM_HTTP";
    }

    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        if (!process.env.TELEGRAM_BOT_TOKEN) {
            const err = "[TelegramAdapter] TELEGRAM_BOT_TOKEN não configurado no .env";
            return { success: false, error: err };
        }
        
        const parts = TelegramMapper.getTemplate(eventName, contextData);
        if (!parts || parts.length === 0) {
            const err = `[TelegramAdapter] Template não encontrado para o evento '${eventName}'`;
            return { success: false, error: err };
        }

        // Concatena as partes de texto para o Telegram
        let fullMessage = parts
            .filter(p => p.type === "text" && p.content)
            .map(p => p.content)
            .join("\n\n");

        if (!fullMessage) {
            return { success: false, error: "[TelegramAdapter] Conteúdo da mensagem está vazio" };
        }

        if (env.NODE_ENV !== 'production') {
            fullMessage = `[DEV]\n${fullMessage}`;
        }

        try {
            await addToTelegramQueue({
                message: fullMessage,
                context: (options?.metadata?.eventType as string) || ""
            }, options?.jobId);
            return { success: true };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[TelegramAdapter] Erro ao enfileirar mensagem do Telegram");
            return { success: false, error: errorMessage };
        }
    }
}
