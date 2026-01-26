import QRCode from "qrcode";
import { GLOBAL_WHATSAPP_INSTANCE } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { CompositeMessagePart } from "../../types/dtos/whatsapp.dto.js";

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

        // NOTIFICAR SEMPRE PELA INSTÂNCIA GLOBAL (BYPASS)
        // Antes: usava driverInstance se conectado. Agora: Global para todos.
        return await this._processAndEnqueue(to, parts, type, GLOBAL_WHATSAPP_INSTANCE, ctx.pixPayload);
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

            case DRIVER_EVENT_PIX_KEY_VALIDATED: parts = DriverTemplates.pixKeyValidated(ctx); break;
            case DRIVER_EVENT_PRE_PASSENGER_CREATED: parts = DriverTemplates.prePassengerCreated(ctx); break;
        }

        // Motorista recebe da instância global
        return await this._processAndEnqueue(to, parts, type, GLOBAL_WHATSAPP_INSTANCE, ctx.pixPayload);
    },

    /**
     * Processa as partes da mensagem (Gera QR Codes se necessário) e Enfileira
     */
    /**
     * Central Dispatcher - Suporta Múltiplos Canais (WhatsApp, SMS, Email)
     * Atualmente implementado apenas WhatsApp, mas pronto para expansão via switch/strategies.
     */
    async _processAndEnqueue(
        to: string, 
        parts: CompositeMessagePart[], 
        eventType: string, 
        instanceName?: string,
        pixPayload?: string,
        channels: ("WHATSAPP" | "SMS" | "EMAIL")[] = ["WHATSAPP"] // Default channel
    ): Promise<boolean> {
        try {
            const results: boolean[] = [];

            // 1. Channel: WHATSAPP
            if (channels.includes("WHATSAPP")) {
                const whatsappSuccess = await this._dispatchWhatsapp(to, parts, eventType, instanceName, pixPayload);
                results.push(whatsappSuccess);
            }

            // 2. Channel: SMS (Skeleton)
            if (channels.includes("SMS")) {
                // TODO: Implement SMS Service Integration
                // const smsSuccess = await smsService.send(...)
                // results.push(smsSuccess);
                logger.debug({ to, eventType }, "Canal SMS solicitado mas ainda não implementado (Skeleton).");
            }

            // 3. Channel: EMAIL (Skeleton)
            if (channels.includes("EMAIL")) {
                // TODO: Implement Email Service Integration
                // const emailSuccess = await emailService.send(...)
                // results.push(emailSuccess);
                logger.debug({ to, eventType }, "Canal EMAIL solicitado mas ainda não implementado (Skeleton).");
            }

            return results.some(r => r); // Retorna true se pelo menos um canal funcionou

        } catch (error) {
            logger.error({ error, to }, "Erro no NotificationService (Dispatch)");
            return false;
        }
    },

    /**
     * Implementação Específica do Canal WhatsApp
     */
    async _dispatchWhatsapp(
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
                        delete part.meta; 
                    } catch (e) {
                         logger.error({ error: e }, "Erro ao gerar QR Code na parte da mensagem");
                         part.mediaBase64 = undefined; 
                    }
                }
            }
            
            // 2. Filtar partes inválidas
            const validParts = parts.filter(p => !((p.type === 'image') && !p.mediaBase64));

            const phone = process.env.NODE_ENV === "development" ? 
                 ("5511999999999") : // Fallback dev 
                 (to); // Production

             // 3. Enviar para a Fila do WhatsApp
             const jobId = eventType !== "UNKNOWN" ? `whatsapp-${to}-${eventType}-${Date.now()}` : undefined;

             await addToWhatsappQueue({
                 phone,
                 compositeMessage: validParts, 
                 context: eventType,
                 options: { instanceName } 
             }, jobId);
             
             logger.info({ eventType, phone, instanceName, jobId, channel: "WHATSAPP" }, "Notificação enfileirada.");
             return true; 

        } catch (error) {
            logger.error({ error, to }, "Erro no Dispatch WhatsApp");
            return false;
        }
    }
};
