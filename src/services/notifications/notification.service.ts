import QRCode from "qrcode";
import { logger } from "../../config/logger.js";
import { whatsappService } from "../whatsapp.service.js"; // Provider

import { DriverContext, DriverTemplates } from "./templates/driver.template.js";
import { PassengerContext, PassengerTemplates } from "./templates/passenger.template.js";

type PassengerEventType = "DUE_SOON" | "DUE_TODAY" | "OVERDUE" | "PAYMENT_RECEIVED";
type DriverEventType = "ACTIVATION" | "RENEWAL" | "UPGRADE" | "PAYMENT_RECEIVED_ALERT";

export const notificationService = {

    /**
     * Envia notificação para Passageiro/Responsável
     */
    async notifyPassenger(
        to: string, 
        type: PassengerEventType, 
        ctx: PassengerContext & { pixPayload?: string }
    ): Promise<boolean> {
        
        let message = "";
        // Selecionar Template
        switch (type) {
            case "DUE_SOON": message = PassengerTemplates.dueSoon(ctx); break;
            case "DUE_TODAY": message = PassengerTemplates.dueToday(ctx); break;
            case "OVERDUE": message = PassengerTemplates.overdue(ctx); break;
            case "PAYMENT_RECEIVED": message = PassengerTemplates.paymentReceived(ctx); break;
        }

        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload);
    },

    /**
     * Envia notificação para Motorista/Assinante
     */
    async notifyDriver(
        to: string, 
        type: DriverEventType, 
        ctx: DriverContext & { pixPayload?: string, nomePagador?: string, nomeAluno?: string }
    ): Promise<boolean> {

        let message = "";
        switch (type) {
            case "ACTIVATION": message = DriverTemplates.activation(ctx); break;
            case "RENEWAL": message = DriverTemplates.renewal(ctx); break;
            case "UPGRADE": message = DriverTemplates.upgradeRequest(ctx); break;
            case "PAYMENT_RECEIVED_ALERT": 
                // cast para tipo estendido
                message = DriverTemplates.paymentReceivedBySystem(ctx as any); 
                break;
        }

        return await this._sendWithOptionalMedia(to, message, ctx.pixPayload);
    },

    /**
     * Lógica interna de envio (Texto + Imagem Opcional + Pix Opcional)
     */
    async _sendWithOptionalMedia(to: string, message: string, pixPayload?: string): Promise<boolean> {
        try {
            let imageBase64 = null;
            
            // 1. Gerar Imagem do QR Code se tiver payload
            if (pixPayload) {
                try {
                    const fullBase64 = await QRCode.toDataURL(pixPayload);
                    imageBase64 = fullBase64.replace(/^data:image\/[a-z]+;base64,/, "");
                } catch (e) {
                    logger.error("Erro ao gerar QR Code:", e);
                }
            }

            let sent = false;

            // 2. Enviar Mensagem Principal (Com ou sem imagem)
            if (imageBase64) {
                sent = await whatsappService.sendImage(to, imageBase64, message);
            } else {
                sent = await whatsappService.sendText(to, message);
            }

            // 3. Enviar Payload Pix (Separado) se enviado com sucesso
            if (sent && pixPayload) {
                await whatsappService.sendText(to, pixPayload);
            }

            return sent;

        } catch (error) {
            logger.error({ error, to }, "Erro no NotificationService");
            return false;
        }
    }
};
