import { NotificationProviderAdapter } from "../ports/notification-provider.port.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { addToTelegramQueue } from "../../../queues/telegram.queue.js";

export class TelegramAdapter implements NotificationProviderAdapter {
    getProviderId(): string {
        return "TELEGRAM_HTTP";
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean> {
        if (!parts || parts.length === 0) return false;

        // Concatena as partes de texto para o Telegram
        const fullMessage = parts
            .filter(p => p.type === "text" && p.content)
            .map(p => p.content)
            .join("\n\n");

        if (!fullMessage) return false;

        try {
            await addToTelegramQueue({
                message: fullMessage,
                context: options?.eventType
            });
            return true;
        } catch (error) {
            return false;
        }
    }
}
