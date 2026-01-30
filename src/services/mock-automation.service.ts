import { logger } from "../config/logger.js";
import { PaymentGateway } from "../types/enums.js";
import { StandardPaymentPayload } from "../types/webhook.js";
import { webhookAssinaturaHandler } from "./handlers/webhook-assinatura.handler.js";
import { webhookCobrancaHandler } from "./handlers/webhook-cobranca.handler.js";
import { paymentService } from "./payment.service.js";

export enum MockPaymentType {
  COBRANCA = "cobranca",
  ASSINATURA = "assinatura",
}

export const mockAutomationService = {
  /**
   * Agenda a "confirmação" de um pagamento mock para daqui a X segundos.
   */
  schedulePayment(
    gatewayTransactionId: string,
    amount: number,
    type: MockPaymentType,
    delayMs = 5000
  ) {
    if (!paymentService.isMock()) {
      logger.warn({ gatewayTransactionId }, "MockAutomation: Tentativa de agendar pagamento mock fora do modo MOCK. Ignorado.");
      return;
    }

    logger.info({ gatewayTransactionId, amount, type, delayMs }, `MockAutomation: Agendando confirmação de pagamento para daqui a ${delayMs/1000}s...`);

    setTimeout(async () => {
      try {
        const payload: StandardPaymentPayload = {
          gatewayTransactionId,
          amount,
          paymentDate: new Date().toISOString(),
          gateway: PaymentGateway.MOCK,
          rawPayload: { simulated: true, mockAt: new Date().toISOString() },
          endToEndId: `E2E-MOCK-${Date.now()}`
        };

        let result = false;
        if (type === MockPaymentType.COBRANCA) {
          result = await webhookCobrancaHandler.handle(payload);
        } else {
          result = await webhookAssinaturaHandler.handle(payload);
        }

        logger.info({ gatewayTransactionId, type, success: result }, "MockAutomation: Pagamento confirmado via simulação de webhook.");
      } catch (err: any) {
        logger.error({ err: err.message, gatewayTransactionId, type }, "MockAutomation: Falha ao processar confirmação simulada.");
      }
    }, delayMs);
  }
};
