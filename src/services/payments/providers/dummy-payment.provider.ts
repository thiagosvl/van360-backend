import { logger } from "../../../config/logger.js";
import { ChargeResponse, CreateChargeRequest, NormalizedPaymentEvent, PaymentProviderAdapter } from "../../../types/payment.js";

/**
 * Provedor Dummy (Simulação) — usado em desenvolvimento e testes.
 * Não realiza nenhuma operação real com bancos ou gateways.
 */
export class DummyPaymentProvider implements PaymentProviderAdapter {
    readonly providerName = "dummy";

    async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
        logger.info({ externalId: request.externalId }, "[DummyProvider] Simulando criação de cobrança...");

        return {
            success: true,
            providerId: `dummy_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            pixCopyPaste: "00020101021226840014br.gov.bcb.pix0136CHAVE_DUMMY",
            pixQrCodeUrl: "https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=DUMMY_PIX",
            paymentLink: `https://van360.com.br/pay/dummy_${request.externalId}`,
        };
    }

    async cancelCharge(providerId: string): Promise<boolean> {
        logger.info({ providerId }, "[DummyProvider] Simulando cancelamento...");
        return true;
    }

    async getChargeStatus(_providerId: string): Promise<string> {
        return "pending";
    }

    normalizeWebhook(rawBody: Record<string, unknown>): NormalizedPaymentEvent | null {
        logger.debug({ rawBody }, "[DummyProvider] Webhook recebido (simulado)");
        return null;
    }
}
