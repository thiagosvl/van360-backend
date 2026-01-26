import { logger } from "../../config/logger.js";

// Constantes para controle de spam
const DISCONNECTION_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora
const MAX_NOTIFICATIONS_PER_DAY = 5;

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        // DEBUG: Log received webhooks (ignore presence updates)
        if (event !== "presence.update") {
             // logger.info({ event, instance }, "Webhook Evolution Recebido"); 
        }

        try {
            switch (event) {
                case "send.message":
                    return await this.handleSendMessage(instance, data);
                case "messages.update":
                    return await this.handleMessagesUpdate(instance, data);
                    
                // IGNORAR TUDO RELACIONADO A CONEXÃO DE MOTORISTA
                case "connection.update":
                case "qrcode.updated":
                case "logout.instance":
                    return true;

                default:
                    return true;
            }
        } catch (error) {
            logger.error({ error, event, instance }, "Erro ao processar webhook Evolution");
            return false;
        }
    },

    /**
     * Processa confirmação de envio de mensagem
     */
    async handleSendMessage(instanceName: string, data: any): Promise<boolean> {
        return true; // Apenas acknowledge
    },

    /**
     * Processa atualização de status de mensagem
     */
    async handleMessagesUpdate(instanceName: string, data: any): Promise<boolean> {
        return true; // Apenas acknowledge
    }
};
