import { logger } from "../../../config/logger.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { NotificationProviderAdapter } from "../ports/notification-provider.port.js";

/**
 * Adapter Mockado para envio de SMS
 */
export class MockSmsAdapter implements NotificationProviderAdapter {
    getProviderId(): string {
        return "MOCK_SMS";
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean> {
        try {
            const textOnly = parts.map(p => p.content || '').join('\n');
            logger.debug({ to, eventType: options?.eventType, textOnly }, "[MockSmsAdapter] Dispatcher SMS Simulado");
            
            // TODO: Integrar com Twilio / Vonage / AWS SNS aqui no futuro
            return true;
        } catch (error) {
            logger.error({ error, to }, "Erro no MockSmsAdapter");
            return false;
        }
    }
}
