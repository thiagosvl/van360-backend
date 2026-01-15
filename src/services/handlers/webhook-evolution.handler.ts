import { WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        // DEBUG: Log received webhooks (ignore presence updates)
        if (event !== "presence.update") {
             logger.info({ event, instance }, "Webhook Evolution: Recebido com sucesso!");
        }

        switch (event) {
            case "connection.update":
                return await this.handleConnectionUpdate(instance, data);
            case "qrcode.updated":
                return await this.handleQrCodeUpdated(instance, data);
            default:
                //logger.info({ event }, "Webhook Evolution: Evento ignorado.");
                return true;
        }
    },

    async handleQrCodeUpdated(instanceName: string, data: any): Promise<boolean> {
        // data: { qrcode: string, pairingCode: string }
        const { pairingCode } = data;

        if (!pairingCode) {
            // logger.info({ instanceName }, "Webhook Evolution: Recebido qrcode.updated mas sem pairingCode. Ignorando.");
            return true; 
        }

        if (!instanceName.startsWith("user_")) return false;
        const usuarioId = instanceName.replace("user_", "");

        const expiresAt = new Date(Date.now() + 60000).toISOString();
        logger.info({ 
            instanceName, 
            pairingCode, 
            expiresAt,
            usuarioId 
        }, "Webhook Evolution: Salvando novo Pairing Code no banco.");

        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ 
                pairing_code: pairingCode, 
                pairing_code_expires_at: expiresAt
            }) 
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao salvar pairing_code via webhook");
            return false;
        }
        return true;
    },

    async handleConnectionUpdate(instanceName: string, data: any): Promise<boolean> {
        // data: { state: "open" | "close" | "connecting", statusReason: number }
        const { state } = data;
        
        // Extrair ID do usuário: "user_{uuid}" -> "{uuid}"
        if (!instanceName.startsWith("user_")) {
            // logger.warn({ instanceName }, "Webhook Evolution: Instância desconhecida (não começa com user_)");
            return false;
        }

        const usuarioId = instanceName.replace("user_", "");
        
        const statusMap: Record<string, string> = {
            open: WHATSAPP_STATUS.CONNECTED,
            connected: WHATSAPP_STATUS.CONNECTED,
            close: WHATSAPP_STATUS.DISCONNECTED,
            disconnected: WHATSAPP_STATUS.DISCONNECTED,
            connecting: WHATSAPP_STATUS.CONNECTING
        };

        const dbStatus = statusMap[state] || WHATSAPP_STATUS.DISCONNECTED;
        
        const updateData: any = { whatsapp_status: dbStatus };
        
        // Se conectou, limpa o código de pareamento
        if (state === "open" || state === "connected") {
             updateData.pairing_code = null;
             updateData.pairing_code_expires_at = null;
        }

        logger.info({ instanceName, state, dbStatus }, "Webhook Evolution: Atualizando status de conexão");

        // Atualizar Banco
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update(updateData)
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao atualizar whatsapp_status via webhook");
            return false;
        }

        return true;
    }
};
