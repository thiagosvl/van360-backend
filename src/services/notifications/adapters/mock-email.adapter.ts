import { logger } from "../../../config/logger.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { NotificationProviderAdapter } from "../ports/notification-provider.port.js";

/**
 * Adapter Mockado para envio de E-mail
 */
export class MockEmailAdapter implements NotificationProviderAdapter {
    getProviderId(): string {
        return "MOCK_EMAIL";
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean> {
        try {
            logger.debug({ to, eventType: options?.eventType }, "[MockEmailAdapter] Dispatcher E-mail Simulado");
            
            // TODO: Integrar com AWS SES / SendGrid / Resend aqui no futuro
            return true;
        } catch (error) {
            logger.error({ error, to }, "Erro no MockEmailAdapter");
            return false;
        }
    }
}
