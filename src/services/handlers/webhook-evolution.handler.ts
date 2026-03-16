import { logger } from "../../config/logger.js";
import { AtividadeAcao, AtividadeEntidadeTipo } from "../../types/enums.js";
import { historicoService } from "../historico.service.js";

// Constantes para controle de spam
const DISCONNECTION_NOTIFICATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hora
const MAX_NOTIFICATIONS_PER_DAY = 5;

export const webhookEvolutionHandler = {
    async handle(payload: any): Promise<boolean> {
        const { event, instance, data } = payload;
        
        try {
            switch (event) {
                case "send.message":
                    return await this.handleSendMessage(instance, data);
                case "messages.update":
                    return await this.handleMessagesUpdate(instance, data);
                
                case "connection.update":
                    return await this.handleConnectionUpdate(instance, data);

                // IGNORAR
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
     * Processa atualização de conexão (WhatsApp)
     */
    async handleConnectionUpdate(instanceName: string, data: any): Promise<boolean> {
        const { state } = data;
        
        // Extrair usuarioId do nome da instância: motorista-{uuid}
        const usuarioId = instanceName.split("motorista-")[1];
        
        if (!usuarioId || !state) return true;

        logger.info({ instanceName, state }, "[Webhook] Status do WhatsApp alterado");

        // Registrar no histórico de atividades
        await historicoService.log({
            usuario_id: usuarioId,
            entidade_tipo: AtividadeEntidadeTipo.USUARIO,
            entidade_id: usuarioId,
            acao: AtividadeAcao.WHATSAPP_STATUS_ALTERADO,
            descricao: `Conexão do WhatsApp alterada para: ${state}.`,
            meta: { status: state, instance: instanceName }
        });

        return true;
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
