import QRCode from "qrcode";
import { logger } from "../../config/logger.js";
import { CompositeMessagePart, whatsappService } from "../whatsapp.service.js"; // Provider

import {
    DRIVER_EVENT_ACCESS_SUSPENDED,
    DRIVER_EVENT_ACTIVATION,
    DRIVER_EVENT_PAYMENT_CONFIRMED,
    DRIVER_EVENT_PAYMENT_RECEIVED_ALERT,
    DRIVER_EVENT_RENEWAL,
    DRIVER_EVENT_RENEWAL_DUE_SOON,
    DRIVER_EVENT_RENEWAL_DUE_TODAY,
    DRIVER_EVENT_RENEWAL_OVERDUE,
    DRIVER_EVENT_REPASSE_FAILED,
    DRIVER_EVENT_TRIAL_ENDING,
    DRIVER_EVENT_UPGRADE,
    PASSENGER_EVENT_DUE_SOON,
    PASSENGER_EVENT_DUE_TODAY,
    PASSENGER_EVENT_OVERDUE,
    PASSENGER_EVENT_PAYMENT_RECEIVED
} from "../../config/constants.js";
import { DriverContext, DriverTemplates } from "./templates/driver.template.js";
import { PassengerContext, PassengerTemplates } from "./templates/passenger.template.js";

type PassengerEventType = 
    | typeof PASSENGER_EVENT_DUE_SOON 
    | typeof PASSENGER_EVENT_DUE_TODAY 
    | typeof PASSENGER_EVENT_OVERDUE 
    | typeof PASSENGER_EVENT_PAYMENT_RECEIVED;

type DriverEventType = 
    | typeof DRIVER_EVENT_ACTIVATION 
    | typeof DRIVER_EVENT_RENEWAL 
    | typeof DRIVER_EVENT_UPGRADE 
    | typeof DRIVER_EVENT_PAYMENT_RECEIVED_ALERT
    | typeof DRIVER_EVENT_RENEWAL_DUE_SOON
    | typeof DRIVER_EVENT_RENEWAL_DUE_TODAY
    | typeof DRIVER_EVENT_RENEWAL_OVERDUE
    | typeof DRIVER_EVENT_ACCESS_SUSPENDED
    | typeof DRIVER_EVENT_PAYMENT_CONFIRMED
    | typeof DRIVER_EVENT_TRIAL_ENDING
    | typeof DRIVER_EVENT_REPASSE_FAILED;

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
        }

        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload, ctx.reciboUrl);
    },

    /**
     * Envia notificação para Motorista/Assinante
     */
    async notifyDriver(
        to: string, 
        type: DriverEventType, 
        ctx: DriverContext & { pixPayload?: string, nomePagador?: string, nomeAluno?: string, diasAtraso?: number, reciboUrl?: string }
    ): Promise<boolean> {

        let message = "";
        switch (type) {
            case DRIVER_EVENT_ACTIVATION: message = DriverTemplates.activation(ctx); break;
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
        }

        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload, ctx.reciboUrl);
    },

    /**
     * Lógica interna de envio (Texto + Imagem Opcional + Pix Opcional)
     */
    /**
     * Lógica interna de envio (Texto + Imagem Opcional + Pix Opcional + Recibo Opcional)
     * Refatorado para usar o padrão Composite (Lego)
     */
    async _sendWithOptionalMedia(to: string, message: string, pixPayload?: string, reciboUrl?: string): Promise<boolean> {
        try {
            const parts: CompositeMessagePart[] = [];
            
            // 1. Priorizar Recibo se houver (Imagem do Comprovante)
            if (reciboUrl) {
                parts.push({
                    type: "image",
                    mediaBase64: reciboUrl, // O WhatsappService.sendImage aceita URL se a Evolution suportar, ou precisamos baixar.
                    content: message // Usa a mensagem como legenda do recibo
                });
            } 
            else {
                // ... lógica existente de QR Code ou apenas Texto
                let imageBase64 = null;
                
                // 1. Gerar Imagem do QR Code se tiver payload
                if (pixPayload) {
                    try {
                        const fullBase64 = await QRCode.toDataURL(pixPayload);
                        imageBase64 = fullBase64.replace(/^data:image\/[a-z]+;base64,/, "");
                    } catch (e) {
                        logger.error({ error: e }, "Erro ao gerar QR Code");
                    }
                }

                // 2. Montar Peças do Lego
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

            // Peça Extra: Payload PIX (se houver e não for recibo - recibo já confirma o pagamento)
            if (pixPayload && !reciboUrl) {
                parts.push({
                    type: "text",
                    content: pixPayload,
                    delayMs: 1500
                });
            }

            // 3. Enviar Composição
            return await whatsappService.sendCompositeMessage(to, parts);

        } catch (error) {
            logger.error({ error, to }, "Erro no NotificationService");
            return false;
        }
    }
};
