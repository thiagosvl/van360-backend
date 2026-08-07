import { logger } from "../../config/logger.js";
import { EvolutionEvent, NotificationChannelEnum } from '../../types/enums.js';
import { EvolutionConnectionStatus } from "../../types/enums.js";

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

        const offlineStates = [EvolutionConnectionStatus.CLOSE, EvolutionConnectionStatus.DISCONNECTED, EvolutionConnectionStatus.REFUSED, "connecting", "refused"];
        const isOffline = offlineStates.includes(state as EvolutionConnectionStatus) || offlineStates.includes(state);

        if (isOffline) {
            const { redisConfig } = await import("../../config/redis.js");
            const { Redis } = await import("ioredis");
            const redisClient = new Redis(redisConfig as any);
            const throttleKey = `alert:evolution:${instanceName}`;
            
            const isThrottled = await redisClient.get(throttleKey);
            if (isThrottled) {
                logger.info({ instanceName, state }, "[Webhook] Alerta do Telegram silenciado pelo Throttle do Redis (Cooldown).");
                redisClient.disconnect();
                return true;
            }

            // Define o silence period (2 horas = 7200 segundos)
            await redisClient.setex(throttleKey, 7200, "1");
            redisClient.disconnect();

            const { notificationService } = await import("../notifications/notification.service.js");
            const { EVENTO_ADMIN_SISTEMA_ALERTA } = await import("../../config/constants.js");
            
            await notificationService.notifyAdmin(EVENTO_ADMIN_SISTEMA_ALERTA, {
                titulo: "ALERTA DE INSTABILIDADE (WHATSAPP)",
                mensagem: `O WhatsApp (Instância: ${instanceName}) reportou instabilidade ou queda.`,
                detalhes: {
                    "Instância": instanceName,
                    "Status": state
                }
            }, {
                channels: [NotificationChannelEnum.TELEGRAM],
                jobId: `admin-alerta-desconexao-${instanceName}-${Date.now()}` // Timestamp garante que o BullMQ não deduplique indevidamente
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
