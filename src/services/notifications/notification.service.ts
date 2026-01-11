import QRCode from "qrcode";
import { GLOBAL_WHATSAPP_INSTANCE } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { CompositeMessagePart } from "../../types/dtos/whatsapp.dto.js";
import { whatsappService } from "../whatsapp.service.js";

import {
    DRIVER_EVENT_ACCESS_SUSPENDED,
    DRIVER_EVENT_ACTIVATION,
    DRIVER_EVENT_PAYMENT_CONFIRMED,
    DRIVER_EVENT_PAYMENT_RECEIVED_ALERT,
    DRIVER_EVENT_PRE_PASSENGER_CREATED,
    DRIVER_EVENT_RENEWAL,
    DRIVER_EVENT_RENEWAL_DUE_SOON,
    DRIVER_EVENT_RENEWAL_DUE_TODAY,
    DRIVER_EVENT_RENEWAL_OVERDUE,
    DRIVER_EVENT_REPASSE_FAILED,
    DRIVER_EVENT_TRIAL_ENDING,
    DRIVER_EVENT_UPGRADE,
    DRIVER_EVENT_WELCOME_FREE,
    DRIVER_EVENT_WELCOME_TRIAL,
    DRIVER_EVENT_WHATSAPP_DISCONNECTED,
    PASSENGER_EVENT_DUE_SOON,
    PASSENGER_EVENT_DUE_TODAY,
    PASSENGER_EVENT_MANUAL,
    PASSENGER_EVENT_OVERDUE,
    PASSENGER_EVENT_PAYMENT_RECEIVED
} from "../../config/constants.js";
import { addToWhatsappQueue } from "../../queues/whatsapp.queue.js";
import { DriverContext, DriverTemplates } from "./templates/driver.template.js";
import { PassengerContext, PassengerTemplates } from "./templates/passenger.template.js";

type PassengerEventType = 
    | typeof PASSENGER_EVENT_DUE_SOON 
    | typeof PASSENGER_EVENT_DUE_TODAY 
    | typeof PASSENGER_EVENT_OVERDUE 
    | typeof PASSENGER_EVENT_PAYMENT_RECEIVED
    | typeof PASSENGER_EVENT_MANUAL;

type DriverEventType = 
    | typeof DRIVER_EVENT_ACTIVATION 
    | typeof DRIVER_EVENT_WELCOME_FREE 
    | typeof DRIVER_EVENT_WELCOME_TRIAL 
    | typeof DRIVER_EVENT_RENEWAL 
    | typeof DRIVER_EVENT_UPGRADE 
    | typeof DRIVER_EVENT_PAYMENT_RECEIVED_ALERT
    | typeof DRIVER_EVENT_RENEWAL_DUE_SOON
    | typeof DRIVER_EVENT_RENEWAL_DUE_TODAY
    | typeof DRIVER_EVENT_RENEWAL_OVERDUE
    | typeof DRIVER_EVENT_ACCESS_SUSPENDED
    | typeof DRIVER_EVENT_PAYMENT_CONFIRMED
    | typeof DRIVER_EVENT_TRIAL_ENDING
    | typeof DRIVER_EVENT_REPASSE_FAILED
    | typeof DRIVER_EVENT_WHATSAPP_DISCONNECTED
    | typeof DRIVER_EVENT_PRE_PASSENGER_CREATED;

export const notificationService = {

    /**
     * Envia notificação para Passageiro/Responsável
     */
    async notifyPassenger(
        to: string, 
        type: PassengerEventType, 
        ctx: PassengerContext & { pixPayload?: string, reciboUrl?: string }
    ): Promise<boolean> {
        
        let message = "";
        // Selecionar Template
        switch (type) {
            case PASSENGER_EVENT_DUE_SOON: message = PassengerTemplates.dueSoon(ctx); break;
            case PASSENGER_EVENT_DUE_TODAY: message = PassengerTemplates.dueToday(ctx); break;
            case PASSENGER_EVENT_OVERDUE: message = PassengerTemplates.overdue(ctx); break;
            case PASSENGER_EVENT_PAYMENT_RECEIVED: message = PassengerTemplates.paymentReceived(ctx); break;
            case PASSENGER_EVENT_MANUAL: message = PassengerTemplates.manualCharge(ctx); break;
        }

        // Tentar enviar pela instância do motorista
        const driverInstance = whatsappService.getInstanceName(ctx.usuarioId);
        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload, ctx.reciboUrl, driverInstance, type);
    },

    /**
     * Envia notificação para Motorista/Assinante
     */
    async notifyDriver(
        to: string, 
        type: DriverEventType, 
        ctx: DriverContext & { pixPayload?: string, nomePagador?: string, nomeAluno?: string, diasAtraso?: number, reciboUrl?: string, trialDays?: number }
    ): Promise<boolean> {

        let message = "";
        switch (type) {
            case DRIVER_EVENT_ACTIVATION: message = DriverTemplates.activation(ctx); break;
            case DRIVER_EVENT_WELCOME_FREE: message = DriverTemplates.welcomeFree(ctx); break;
            case DRIVER_EVENT_WELCOME_TRIAL: message = DriverTemplates.welcomeTrial(ctx); break;
            case DRIVER_EVENT_RENEWAL: message = DriverTemplates.renewal(ctx); break;
            case DRIVER_EVENT_UPGRADE: message = DriverTemplates.upgradeRequest(ctx); break;
            case DRIVER_EVENT_PAYMENT_RECEIVED_ALERT: 
                // cast para tipo estendido
                message = DriverTemplates.paymentReceivedBySystem(ctx as any); 
                break;
            case DRIVER_EVENT_RENEWAL_DUE_SOON: message = DriverTemplates.renewalDueSoon(ctx); break;
            case DRIVER_EVENT_RENEWAL_DUE_TODAY: message = DriverTemplates.renewalDueToday(ctx); break;
            case DRIVER_EVENT_RENEWAL_OVERDUE: message = DriverTemplates.renewalOverdue(ctx); break;
            case DRIVER_EVENT_ACCESS_SUSPENDED: message = DriverTemplates.accessSuspended(ctx); break;
            case DRIVER_EVENT_PAYMENT_CONFIRMED: message = DriverTemplates.paymentConfirmed(ctx); break;
            case DRIVER_EVENT_TRIAL_ENDING: message = DriverTemplates.trialEnding(ctx); break;
            case DRIVER_EVENT_REPASSE_FAILED: message = DriverTemplates.repasseFailed(ctx); break;
            case DRIVER_EVENT_WHATSAPP_DISCONNECTED: message = DriverTemplates.whatsappDisconnected(ctx); break;
            case DRIVER_EVENT_PRE_PASSENGER_CREATED: message = DriverTemplates.prePassengerCreated(ctx); break;
        }

        // Motorista recebe da instância global
        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload, ctx.reciboUrl, GLOBAL_WHATSAPP_INSTANCE, type);
    },

    /**
     * Lógica interna de envio (Texto + Imagem Opcional + PIX Opcional + Recibo Opcional)
     * Refatorado para usar o padrão Composite (Lego) + Fallback
     */
    async _sendWithOptionalMedia(to: string, message: string, pixPayload?: string, reciboUrl?: string, instanceName?: string, eventType: string = "UNKNOWN"): Promise<boolean> {
        try {
            const parts: CompositeMessagePart[] = [];
            
            // 1. Priorizar Recibo se houver
            if (reciboUrl) {
                parts.push({
                    type: "image",
                    mediaBase64: reciboUrl, 
                    content: message 
                });
            } 
            else {
                let imageBase64 = null;
                
                if (pixPayload) {
                    try {
                        imageBase64 = await QRCode.toDataURL(pixPayload);
                    } catch (e) {
                        logger.error({ error: e }, "Erro ao gerar QR Code");
                    }
                }

                if (imageBase64) {
                    parts.push({
                        type: "image",
                        mediaBase64: imageBase64,
                        content: message
                    });
                } else {
                    parts.push({
                        type: "text",
                        content: message
                    });
                }
            }

            const phone = process.env.NODE_ENV === "development" ? 
                 ("5511999999999") : // Fallback dev 
                 (to); // Production

             // 5. Enviar para a Fila (Com suporte a Idempotência)
             const jobId = eventType !== "UNKNOWN" ? `whatsapp-${to}-${eventType}-${Date.now()}` : undefined;

             await addToWhatsappQueue({
                 phone,
                 compositeMessage: parts, 
                 context: eventType,
                 options: { instanceName } // Passar a instância alvo
             }, jobId);
             
             logger.info({ eventType, phone, instanceName, jobId }, "Notificação enfileirada com sucesso.");
             return true; 

        } catch (error) {
            logger.error({ error, to }, "Erro no NotificationService");
            return false;
        }
    }
};
