import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";

/**
 * Interface que todo provedor de notificação (WhatsApp, SMS, E-mail) deve implementar
 */
export interface NotificationProviderAdapter {
    /**
     * Envia uma mensagem composta (texto, imagem, áudio, etc)
     */
    sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean>;

    /**
     * Identificador do provedor (ex: "EVOLUTION_WHATSAPP", "TWILIO_SMS", "RESEND_EMAIL")
     */
    getProviderId(): string;
}
