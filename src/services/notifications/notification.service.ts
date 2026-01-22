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
    DRIVER_EVENT_PIX_KEY_VALIDATED,
    DRIVER_EVENT_PRE_PASSENGER_CREATED,
    DRIVER_EVENT_RENEWAL,
    DRIVER_EVENT_RENEWAL_DUE_SOON,
    DRIVER_EVENT_RENEWAL_DUE_TODAY,
    DRIVER_EVENT_RENEWAL_OVERDUE,
    DRIVER_EVENT_REPASSE_FAILED,
    DRIVER_EVENT_TRIAL_ENDING,
    DRIVER_EVENT_UPGRADE,
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
    | typeof DRIVER_EVENT_PIX_KEY_VALIDATED
    | typeof DRIVER_EVENT_WHATSAPP_DISCONNECTED
    | typeof DRIVER_EVENT_PIX_KEY_VALIDATED
    | typeof DRIVER_EVENT_PIX_KEY_VALIDATED
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
        
        let parts: CompositeMessagePart[] = [];
        
        switch (type) {
            case PASSENGER_EVENT_DUE_SOON: parts = PassengerTemplates.dueSoon(ctx); break;
            case PASSENGER_EVENT_DUE_TODAY: parts = PassengerTemplates.dueToday(ctx); break;
            case PASSENGER_EVENT_OVERDUE: parts = PassengerTemplates.overdue(ctx); break;
            case PASSENGER_EVENT_PAYMENT_RECEIVED: parts = PassengerTemplates.paymentReceived(ctx); break;
            case PASSENGER_EVENT_MANUAL: parts = PassengerTemplates.manualCharge(ctx); break;
        }

        // Tentar enviar pela instância do motorista
        const driverInstance = whatsappService.getInstanceName(ctx.usuarioId);
        
        return await this._processAndEnqueue(to, parts, type, driverInstance, ctx.pixPayload);
    },

    /**
     * Envia notificação para Motorista/Assinante
     */
    async notifyDriver(
        to: string, 
        type: DriverEventType, 
        ctx: DriverContext & { pixPayload?: string, nomePagador?: string, nomePassageiro?: string, diasAtraso?: number, reciboUrl?: string, trialDays?: number }
    ): Promise<boolean> {

        let parts: CompositeMessagePart[] = [];

        switch (type) {
            case DRIVER_EVENT_ACTIVATION: parts = DriverTemplates.activation(ctx); break;
            case DRIVER_EVENT_WELCOME_TRIAL: parts = DriverTemplates.welcomeTrial(ctx); break;
            case DRIVER_EVENT_RENEWAL: parts = DriverTemplates.renewal(ctx); break;
            case DRIVER_EVENT_UPGRADE: parts = DriverTemplates.upgradeRequest(ctx); break;
            case DRIVER_EVENT_PAYMENT_RECEIVED_ALERT: 
                parts = DriverTemplates.paymentReceivedBySystem(ctx as any); 
                break;
            case DRIVER_EVENT_RENEWAL_DUE_SOON: parts = DriverTemplates.renewalDueSoon(ctx); break;
            case DRIVER_EVENT_RENEWAL_DUE_TODAY: parts = DriverTemplates.renewalDueToday(ctx); break;
            case DRIVER_EVENT_RENEWAL_OVERDUE: parts = DriverTemplates.renewalOverdue(ctx); break;
            case DRIVER_EVENT_ACCESS_SUSPENDED: parts = DriverTemplates.accessSuspended(ctx); break;
            case DRIVER_EVENT_PAYMENT_CONFIRMED: parts = DriverTemplates.paymentConfirmed(ctx); break;
            case DRIVER_EVENT_TRIAL_ENDING: parts = DriverTemplates.trialEnding(ctx); break;
            case DRIVER_EVENT_REPASSE_FAILED: parts = DriverTemplates.repasseFailed(ctx); break;
            case DRIVER_EVENT_WHATSAPP_DISCONNECTED: parts = DriverTemplates.whatsappDisconnected(ctx); break;
            case DRIVER_EVENT_PIX_KEY_VALIDATED: parts = DriverTemplates.pixKeyValidated(ctx); break;
            case DRIVER_EVENT_PIX_KEY_VALIDATED: parts = DriverTemplates.pixKeyValidated(ctx); break;
            case DRIVER_EVENT_PIX_KEY_VALIDATED: parts = DriverTemplates.pixKeyValidated(ctx); break;
            case DRIVER_EVENT_PRE_PASSENGER_CREATED: parts = DriverTemplates.prePassengerCreated(ctx); break;
        }

        // Motorista recebe da instância global
        return await this._processAndEnqueue(to, parts, type, GLOBAL_WHATSAPP_INSTANCE, ctx.pixPayload);
    },

    /**
     * Processa as partes da mensagem (Gera QR Codes se necessário) e Enfileira
     */
    async _processAndEnqueue(
        to: string, 
        parts: CompositeMessagePart[], 
        eventType: string, 
        instanceName?: string,
        pixPayload?: string
    ): Promise<boolean> {
        try {
            // 1. Processar partes dinâmicas (ex: Gerar QR Code)
            for (const part of parts) {
                if (part.meta === 'qrcode' && pixPayload) {
                    try {
                        part.mediaBase64 = await QRCode.toDataURL(pixPayload);
                        // Remover meta para limpar o objeto antes do envio
                        delete part.meta; 
                    } catch (e) {
                         logger.error({ error: e }, "Erro ao gerar QR Code na parte da mensagem");
                         // Em caso de erro, removemos a parte de imagem para não enviar imagem quebrada,
                         // mas mantemos o resto (texto do copy paste vai garantir o pagamento)
                         part.mediaBase64 = undefined; 
                    }
                }
            }
            
            // 2. Filtrar partes que deveriam ter imagem mas falharam (opcional) ou vazias
            const validParts = parts.filter(p => !((p.type === 'image') && !p.mediaBase64));

            const phone = process.env.NODE_ENV === "development" ? 
                 ("5511999999999") : // Fallback dev 
                 (to); // Production

             // 3. Enviar para a Fila
             const jobId = eventType !== "UNKNOWN" ? `whatsapp-${to}-${eventType}-${Date.now()}` : undefined;

             await addToWhatsappQueue({
                 phone,
                 compositeMessage: validParts, 
                 context: eventType,
                 options: { instanceName } 
             }, jobId);
             
             logger.info({ eventType, phone, instanceName, jobId, partsCount: validParts.length }, "Notificação Lego enfileirada com sucesso.");
             return true; 

        } catch (error) {
            logger.error({ error, to }, "Erro no NotificationService");
            return false;
        }
    }
};
