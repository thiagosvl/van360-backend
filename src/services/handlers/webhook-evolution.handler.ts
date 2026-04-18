import { logger } from "../../config/logger.js";
import { AtividadeAcao, AtividadeEntidadeTipo, EvolutionEvent } from "../../types/enums.js";
import { historicoService } from "../historico.service.js";

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
