import { NotificationProviderPort } from "../../ports/notification-provider.port.js";
import { addToTelegramQueue } from "../../../../queues/telegram.queue.js";
import { TelegramMapper } from "./telegram.mapper.js";
import { env } from "../../../../config/env.js";
import { logger } from "../../../../config/logger.js";
import { NotificationOptions } from "../../notification.service.js";

export class TelegramAdapter implements NotificationProviderPort {
    getProviderId(): string {
        return "TELEGRAM_HTTP";
    }

    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<boolean> {
        if (!process.env.TELEGRAM_BOT_TOKEN) {return false;}
        
        const parts = TelegramMapper.getTemplate(eventName, contextData);
        if (!parts || parts.length === 0) return false;

        // Concatena as partes de texto para o Telegram
        let fullMessage = parts
            .filter(p => p.type === "text" && p.content)
            .map(p => p.content)
            .join("\n\n");

        if (!fullMessage) return false;

        if (env.NODE_ENV !== 'production') {
            fullMessage = `[DEV]\n${fullMessage}`;
        }

        try {
            await addToTelegramQueue({
                message: fullMessage,
                context: (options?.metadata?.eventType as string) || ""
            }, options?.jobId);
            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[TelegramAdapter] Erro ao enfileirar mensagem do Telegram");
            return false;
        }
    }
}
