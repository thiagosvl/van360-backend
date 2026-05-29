import { PaymentProvider } from "../../../types/enums.js";
import { AppError } from "../../../errors/AppError.js";
import {
    ChargeResponse,
    CreateChargeRequest,
    NormalizedPaymentEvent,
    PaymentProviderAdapter
} from "../../../types/payment.js";

/**
 * Provedor Woovi (Placeholder)
 * Estrutura inativa mantida para futura integração.
 */
export class WooviProvider implements PaymentProviderAdapter {
    readonly providerName = PaymentProvider.WOOVI;

    async createCharge(_request: CreateChargeRequest): Promise<ChargeResponse> {
        throw new AppError("WooviProvider não implementado.", 501);
    }

    async cancelCharge(_providerId: string): Promise<boolean> {
        throw new AppError("WooviProvider não implementado.", 501);
    }

    async getChargeStatus(_providerId: string): Promise<string> {
        throw new AppError("WooviProvider não implementado.", 501);
    }

    async normalizeWebhook(_rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> {
        throw new AppError("WooviProvider não implementado.", 501);
    }
}
