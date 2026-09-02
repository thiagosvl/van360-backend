import { logger } from "../../../../config/logger.js";
import {
    EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO,
    EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO,
    EVENTO_PASSAGEIRO_VENCIMENTO_HOJE,
    EVENTO_PASSAGEIRO_ATRASADO,
    EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL,
    EVENTO_MOTORISTA_ASSINATURA_VENCENDO,
    EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO
} from "../../../../config/constants.js";
import { WabaTemplates, WabaTemplatePayload } from "./waba.template.js";

export class WabaMapper {
    static async getTemplate(eventName: string, contextData: Record<string, unknown>): Promise<WabaTemplatePayload | null> {
        try {
            switch (eventName) {
                case EVENTO_PASSAGEIRO_RECIBO_PAGAMENTO:
                    return WabaTemplates.paymentReceipt(contextData);

                case EVENTO_PASSAGEIRO_VENCIMENTO_PROXIMO:
                    return WabaTemplates.vencimentoProximo(contextData);

                case EVENTO_PASSAGEIRO_VENCIMENTO_HOJE:
                    return WabaTemplates.vencimentoHoje(contextData);

                case EVENTO_PASSAGEIRO_ATRASADO:
                    return WabaTemplates.cobrancaAtrasado(contextData);

                case EVENTO_PASSAGEIRO_CONTRATO_DISPONIVEL:
                    return WabaTemplates.contratoDisponivel(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_VENCENDO:
                    return await WabaTemplates.subscriptionDueSoon(contextData);

                case EVENTO_MOTORISTA_ASSINATURA_FALHA_CARTAO:
                    return await WabaTemplates.subscriptionFailedCC(contextData);

                default:
                    logger.warn({ eventName }, "[WabaMapper] Template não encontrado para o evento.");
                    return null;
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Erro desconhecido";
            logger.error({ error: message, eventName }, "[WabaMapper] Erro ao montar template do WABA.");
            return null;
        }
    }
}

