import { GLOBAL_WHATSAPP_INSTANCE } from "../../../config/constants.js";
import { logger } from "../../../config/logger.js";
import { addToWhatsappQueue } from "../../../queues/whatsapp.queue.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { NotificationProviderAdapter } from "../ports/notification-provider.port.js";

/**
 * Adapter para WhatsApp usando a fila (BullMQ) + Evolution API
 */
export class EvolutionWhatsappQueueAdapter implements NotificationProviderAdapter {
    getProviderId(): string {
        return "EVOLUTION_WHATSAPP_QUEUE";
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean> {
        try {
            const validParts = parts.filter(p => !((p.type === 'image') && !p.mediaBase64));
            if (validParts.length === 0) return false;

            const instanceName = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;
            const eventType = options?.eventType || "UNKNOWN";
            const jobId = eventType !== "UNKNOWN" ? `whatsapp-${to}-${eventType}-${Date.now()}` : undefined;

            await addToWhatsappQueue({
                phone: to,
                compositeMessage: validParts,
                context: eventType,
                options: { instanceName }
            }, jobId);

            return true;
        } catch (error) {
            logger.error({ error, to }, "Erro no EvolutionWhatsappQueueAdapter");
            return false;
        }
    }
}
