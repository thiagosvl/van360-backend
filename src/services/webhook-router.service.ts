import { logger } from "../config/logger.js";
import { PaymentGateway } from "../types/enums.js";
import { StandardPaymentPayload } from "../types/webhook.js";
import { webhookAssinaturaHandler } from "./handlers/webhook-assinatura.handler.js";
import { webhookCobrancaHandler } from "./handlers/webhook-cobranca.handler.js";

export const webhookRouterService = {
  /**
   * Converte um payload específico do gateway para o formato padrão do Van360
   */
  translate(origin: string, rawPayload: any): StandardPaymentPayload {
    // Normaliza para lowercase para evitar problemas de case sensitive
    const gatewayId = origin.toLowerCase();

    if (gatewayId === PaymentGateway.INTER) {
      return {
        gatewayTransactionId: rawPayload.txid,
        endToEndId: rawPayload.endToEndId,
        amount: Number(rawPayload.valor),
        paymentDate: rawPayload.horario || new Date().toISOString(),
        rawPayload: rawPayload,
        gateway: PaymentGateway.INTER
      };
    }

    // Fallback ou outros provedores viriam aqui
    throw new Error(`Origem de webhook desconhecida: ${origin}`);
  },

  /**
   * Roteia o pagamento processado para os handlers de negócio
   */
  async route(payload: StandardPaymentPayload): Promise<boolean> {
    const { gatewayTransactionId, amount, gateway } = payload;
    
    logger.info({ gatewayTransactionId, amount, gateway }, "[WebhookRouter] Roteando pagamento");

    // 1. Tentar Handler de Assinaturas (SaaS)
    const handledAssinatura = await webhookAssinaturaHandler.handle(payload);
    if (handledAssinatura) {
      return true;
    }

    // 2. Tentar Handler de Mensalidades de Pais (Repasse)
    const handledCobranca = await webhookCobrancaHandler.handle(payload);
    if (handledCobranca) {
      return true;
    }

    logger.warn({ gatewayTransactionId }, "[WebhookRouter] Nenhuma cobrança encontrada para este pagamento");
    return false;
  }
};
