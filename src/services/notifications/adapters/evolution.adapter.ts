import { 
    GLOBAL_WHATSAPP_INSTANCE,
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    EVENTO_PASSAGEIRO_ATRASADO,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_AVISO,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_HOJE,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_ATRASO,
    // Eventos em Massa do Motorista
    EVENTO_MOTORISTA_TESTE_EXPIRANDO,
    EVENTO_MOTORISTA_TESTE_HOJE,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_TRIAL_D7_ENGAJADO,
    EVENTO_MOTORISTA_TRIAL_D7_INATIVO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
    EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA
} from "../../../config/constants.js";
import { logger } from "../../../config/logger.js";
import { addToWhatsappQueue } from "../../../queues/whatsapp.queue.js";
import { CompositeMessagePart } from "../../../types/dtos/whatsapp.dto.js";
import { WhatsappPurpose } from "../../../types/enums.js";
import { NotificationProviderAdapter } from "../ports/notification-provider.port.js";

const BULK_EVENTS = [
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    EVENTO_PASSAGEIRO_ATRASADO,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_AVISO,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_HOJE,
    EVENTO_PASSAGEIRO_COBRANCA_PIX_MANUAL_ATRASO,
    EVENTO_MOTORISTA_TESTE_EXPIRANDO,
    EVENTO_MOTORISTA_TESTE_HOJE,
    EVENTO_MOTORISTA_TESTE_ENCERRADO,
    EVENTO_MOTORISTA_TRIAL_D7_ENGAJADO,
    EVENTO_MOTORISTA_TRIAL_D7_INATIVO,
    EVENTO_MOTORISTA_TRIAL_D14_ULTIMO_AVISO,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_1,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_2,
    EVENTO_MOTORISTA_TRIAL_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_VENCEU,
    EVENTO_MOTORISTA_ASSINATURA_ATRASADA,
    EVENTO_MOTORISTA_RENOVACAO_LEMBRETE,
    EVENTO_MOTORISTA_RENOVACAO_URGENCIA,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_1,
    EVENTO_MOTORISTA_RENOVACAO_RECUPERACAO_FINAL,
    EVENTO_MOTORISTA_ANIVERSARIANTES_SEMANA
];

/**
 * Adapter para WhatsApp usando a fila (BullMQ) + Evolution API
 */
export class EvolutionWhatsappQueueAdapter implements NotificationProviderAdapter {
    getProviderId(): string {
        return "EVOLUTION_WHATSAPP_QUEUE";
    }

    async sendComposite(to: string, parts: CompositeMessagePart[], options?: Record<string, any>): Promise<boolean> {
        try {
            const validParts = parts.filter(p => !((p.type === 'image') && !p.mediaBase64));
            if (validParts.length === 0) return false;

            const instanceName = options?.instanceName || GLOBAL_WHATSAPP_INSTANCE;
            const eventType = options?.eventType || "UNKNOWN";
            const jobId = eventType !== "UNKNOWN" ? `whatsapp-${to}-${eventType}-${Date.now()}` : undefined;

            let purpose = options?.purpose;
            if (!purpose) {
                // Infer purpose based on explicit event constants
                const isBulkEvent = BULK_EVENTS.includes(eventType as any);
                purpose = isBulkEvent ? WhatsappPurpose.BULK : WhatsappPurpose.TRANSACTIONAL;
            }

            await addToWhatsappQueue({
                phone: to,
                compositeMessage: validParts,
                context: eventType,
                purpose: purpose,
                options: { instanceName }
            }, jobId);

            return true;
        } catch (error) {
            logger.error({ error, to }, "Erro no EvolutionWhatsappQueueAdapter");
            return false;
        }
    }
}
