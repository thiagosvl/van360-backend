import { logger } from "../config/logger.js";
import { PaymentGateway } from "../types/enums.js";
import { StandardPaymentPayload } from "../types/webhook.js";

export const webhookRouterService = {
  /**
   * Converte um payload específico do gateway para o formato padrão do Van360
   */
  translate(origin: string, rawPayload: any): StandardPaymentPayload {
    // Normaliza para lowercase para evitar problemas de case sensitive
    const gatewayId = origin.toLowerCase();

    // Fallback ou outros provedores viriam aqui
    throw new Error(`Origem de webhook desconhecida: ${origin}`);
  },

  /**
   * Roteia o pagamento processado para os handlers de negócio
   */
  async route(payload: StandardPaymentPayload): Promise<boolean> {
    const { gatewayTransactionId, amount, gateway } = payload;

    logger.info({ gatewayTransactionId, amount, gateway }, "[WebhookRouter] Roteando pagamento");

    // Handlers de assinaturas e mensalidades foram removidos no modelo "Clean Slate".
    // Nenhum pagamento será processado neste momento.

    logger.warn({ gatewayTransactionId }, "[WebhookRouter] Nenhuma cobrança encontrada para este pagamento (modo Clean Slate)");
    return false;
  }
};
