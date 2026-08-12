import { logger } from "../../../../config/logger.js";
import { EVENTO_ADMIN_NOVO_CADASTRO, EVENTO_ADMIN_NOVA_ASSINATURA, EVENTO_ADMIN_ASSINATURA_CANCELADA, EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, EVENTO_ADMIN_SISTEMA_ALERTA } from "../../../../config/constants.js";
import { TelegramTemplates } from "./telegram.template.js";
import { CompositeMessagePart } from "../../../../types/dtos/evolution.dto.js";

export class TelegramMapper {
    static getTemplate(eventName: string, contextData: Record<string, unknown>): CompositeMessagePart[] | null {
        try {
            switch (eventName) {
                case EVENTO_ADMIN_NOVO_CADASTRO: return TelegramTemplates.newRegistration(contextData as never);
                case EVENTO_ADMIN_NOVA_ASSINATURA: return TelegramTemplates.newSubscription(contextData as never);
                case EVENTO_ADMIN_ASSINATURA_CANCELADA: return TelegramTemplates.subscriptionCanceled(contextData as never);
                case EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO: return TelegramTemplates.paymentFailed(contextData as never);
                case EVENTO_ADMIN_SISTEMA_ALERTA: return TelegramTemplates.systemAlert(contextData as never);
                default:
                    logger.warn({ eventName }, "[TelegramMapper] Template não encontrado para o evento.");
                    return null;
            }
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            logger.error({ error: errorMessage, eventName }, "[TelegramMapper] Erro ao montar template do Telegram.");
            return null;
        }
    }
}
