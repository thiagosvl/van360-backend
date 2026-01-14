import { WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        // DEBUG: Log ALL webhooks to verify connectivity
        if (event !== "presence.update") { // Reduce noise
             logger.info({ event, instance }, "Webhook Evolution: Recebido!");
        }

        switch (event) {
            case "connection.update":
                return await this.handleConnectionUpdate(instance, data);
            default:
                //logger.info({ event }, "Webhook Evolution: Evento ignorado.");
                return true;
        }
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
            close: WHATSAPP_STATUS.DISCONNECTED,
            connecting: WHATSAPP_STATUS.CONNECTING
        };

        const dbStatus = statusMap[state] || WHATSAPP_STATUS.DISCONNECTED;

        logger.info({ instanceName, state, dbStatus }, "Webhook Evolution: Atualizando status de conexão");

        // Atualizar Banco
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ whatsapp_status: dbStatus })
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao atualizar whatsapp_status via webhook");
            return false;
        }

        return true;
    }
};
