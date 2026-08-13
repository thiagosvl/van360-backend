import { logger } from "../../../../config/logger.js";
import { NotificationProviderPort, NotificationSendResult } from "../../ports/notification-provider.port.js";
import { NotificationOptions } from "../../notification.service.js";

export class SmsAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<NotificationSendResult> {
        try {
            const to = (contextData.to as string) || "";
            logger.debug({ to, eventName, contextData }, "[MockSmsAdapter] Dispatcher SMS Simulado");
            return { success: true };
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            return { success: false, error: message };
        }
    }
}
