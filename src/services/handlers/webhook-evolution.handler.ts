import { WHATSAPP_STATUS } from "../../config/constants.js";
import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        // DEBUG: Log received webhooks (ignore presence updates)
        if (event !== "presence.update") {
             logger.info({ event, instance, dataKeys: Object.keys(data || {}) }, "Webhook Evolution: Recebido com sucesso!");
        }

        switch (event) {
            case "connection.update":
                return await this.handleConnectionUpdate(instance, data);
            case "qrcode.updated":
                return await this.handleQrCodeUpdated(instance, data);
            default:
                return true;
        }
    },

    async handleQrCodeUpdated(instanceName: string, data: any): Promise<boolean> {
        // data: { qrcode: string, pairingCode: string }
        const { pairingCode } = data;

        // Validação rigorosa
        if (!pairingCode || typeof pairingCode !== 'string' || pairingCode.trim().length === 0) {
            logger.warn({ instanceName, pairingCode }, "Webhook Evolution: qrcode.updated recebido mas pairingCode inválido. Ignorando.");
            return true; 
        }

        // Validação de formato: Pairing Code deve ter entre 8 e 24 caracteres
        if (pairingCode.length < 8 || pairingCode.length > 24) {
            logger.warn({ instanceName, length: pairingCode.length }, "Webhook Evolution: pairingCode com tamanho inválido. Ignorando.");
            return true;
        }

        // Validação de instância
        if (!instanceName.startsWith("user_")) {
            logger.warn({ instanceName }, "Webhook Evolution: Instância não reconhecida (não começa com user_)");
            return false;
        }

        const usuarioId = instanceName.replace("user_", "");

        // Calcular expiração: Pairing Code dura ~60 segundos
        const expiresAt = new Date(Date.now() + 60000).toISOString();
        
        logger.info({ 
            instanceName, 
            pairingCode: pairingCode.substring(0, 4) + "***",
            expiresAt,
            usuarioId 
        }, "Webhook Evolution: Salvando novo Pairing Code no banco.");

        const { error } = await supabaseAdmin
            .from("usuarios")
            .update({ 
                pairing_code: pairingCode, 
                pairing_code_expires_at: expiresAt,
                pairing_code_generated_at: new Date().toISOString()
            }) 
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId }, "Falha ao salvar pairing_code via webhook");
            return false;
        }

        logger.info({ usuarioId }, "Pairing Code salvo com sucesso no banco (Realtime disparará para o frontend)");
        return true;
    },

    async handleConnectionUpdate(instanceName: string, data: any): Promise<boolean> {
        // data: { state: "open" | "close" | "connecting", statusReason: number }
        const { state, statusReason } = data;
        
        // Validação de estado
        if (!state || typeof state !== 'string') {
            logger.warn({ instanceName, state }, "Webhook Evolution: connection.update recebido mas state inválido");
            return false;
        }

        // Extrair ID do usuário: "user_{uuid}" -> "{uuid}"
        if (!instanceName.startsWith("user_")) {
            logger.warn({ instanceName }, "Webhook Evolution: Instância desconhecida (não começa com user_)");
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

        const dbStatus = statusMap[state.toLowerCase()] || WHATSAPP_STATUS.DISCONNECTED;
        
        const updateData: any = { whatsapp_status: dbStatus };
        
        // Se conectou, limpa o código de pareamento
        if (state === "open" || state === "connected") {
             updateData.pairing_code = null;
             updateData.pairing_code_expires_at = null;
             updateData.pairing_code_generated_at = null;
        }

        logger.info({ 
            instanceName, 
            state, 
            dbStatus,
            statusReason,
            usuarioId
        }, "Webhook Evolution: Atualizando status de conexão");

        // Atualizar Banco
        const { error } = await supabaseAdmin
            .from("usuarios")
            .update(updateData)
            .eq("id", usuarioId);

        if (error) {
            logger.error({ error, usuarioId, state }, "Falha ao atualizar whatsapp_status via webhook");
            return false;
        }

        // Se desconectou, disparar notificação (será implementado na próxima fase)
        if (state === "close" || state === "disconnected") {
            logger.warn({ usuarioId, statusReason }, "Webhook Evolution: WhatsApp desconectou. Notificação será disparada em breve.");
            // TODO: Implementar notificação de queda via instância principal
        }

        return true;
    }
};
