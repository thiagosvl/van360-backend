import { logger } from "../../../../config/logger.js";
import { NotificationProviderPort } from "../../ports/notification-provider.port.js";
import { NotificationOptions } from "../../notification.service.js";

export class SmsAdapter implements NotificationProviderPort {
    async send(eventName: string, contextData: Record<string, unknown>, options?: NotificationOptions): Promise<boolean> {
        try {
            const to = (contextData.to as string) || "";
            logger.debug({ to, eventName, contextData }, "[MockSmsAdapter] Dispatcher SMS Simulado");
            return true;
        } catch (error) {
            return false;
        }
    }
}
