import { logger } from "../../config/logger.js";
import { EvolutionEvent } from "../../types/enums.js";
import { WhatsappStatus } from "../../types/enums.js";

interface EvolutionWebhookPayload {
    event: EvolutionEvent;
    instance: string;
    data: {
        state?: string;
        statusReason?: number;
    } & Record<string, unknown>;
}

export const webhookEvolutionHandler = {
    async handle(payload: EvolutionWebhookPayload): Promise<boolean> {
        const { event, instance, data } = payload;

        try {
            switch (event) {
                case EvolutionEvent.SEND_MESSAGE:
                    return await this.handleSendMessage(instance, data);
                case EvolutionEvent.MESSAGES_UPSERT: // Novo evento na v2 para novas mensagens
                case EvolutionEvent.MESSAGES_UPDATE:
                    return await this.handleMessagesUpdate(instance, data);
                case EvolutionEvent.CONNECTION_UPDATE:
                    return await this.handleConnectionUpdate(instance, data);
                case EvolutionEvent.QRCODE_UPDATED:
                case EvolutionEvent.LOGOUT_INSTANCE:
                    return true;
                default:
                    return true;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unkown error in webhook handler";
            logger.error({ err: message, event, instance }, "Erro processador Evolution");
            return false;
        }
    },

    /**
     * Processa atualização de conexão (WhatsApp)
     */
    async handleConnectionUpdate(instanceName: string, data: Record<string, unknown>): Promise<boolean> {
        const state = data.state as string;

        if (!state) return true;

        logger.info({ instanceName, state }, "[Webhook] Status do WhatsApp alterado");

        if (state === WhatsappStatus.CLOSE || state === WhatsappStatus.DISCONNECTED) {
            const { notificationService } = await import("../notifications/notification.service.js");
            const { EVENTO_ADMIN_SISTEMA_ALERTA } = await import("../../config/constants.js");
            
            await notificationService.notifyAdmin(EVENTO_ADMIN_SISTEMA_ALERTA, {
                titulo: "ALERTA DE DESCONEXÃO",
                mensagem: "A conexão do WhatsApp foi perdida.",
                detalhes: {
                    "Instância": instanceName,
                    "Status": state
                }
            });
        }

        return true;
    },

    /**
     * Processa confirmação de envio de mensagem
     */
    async handleSendMessage(instanceName: string, data: Record<string, unknown>): Promise<boolean> {
        return true; // Apenas acknowledge
    },

    /**
     * Processa atualização de status de mensagem
     */
    async handleMessagesUpdate(instanceName: string, data: Record<string, unknown>): Promise<boolean> {
        return true; // Apenas acknowledge
    }
};
