import { CreateChargeRequest, ChargeResponse, NormalizedPaymentEvent, PaymentProviderAdapter } from "../../types/payment.js";
import { PaymentProvider } from "../../types/enums.js";
import { EfipayProvider } from "./providers/efipay.provider.js";
import { WooviProvider } from "./providers/woovi.provider.js";
import { AppError } from "../../errors/AppError.js";
import { logger } from "../../config/logger.js";

class PaymentService {
    private providers: Map<PaymentProvider, PaymentProviderAdapter> = new Map();

    constructor() {
        this.register(new EfipayProvider());
        this.register(new WooviProvider());
    }

    private register(provider: PaymentProviderAdapter): void {
        this.providers.set(provider.providerName, provider);
        logger.info({ provider: provider.providerName }, "[PaymentService] Provider registrado");
    }

    private getProvider(name: PaymentProvider): PaymentProviderAdapter {
        const provider = this.providers.get(name);
        if (!provider) {
            throw new AppError(`Provider de pagamento '${name}' não registrado.`, 500);
        }
        return provider;
    }

    async createCharge(request: CreateChargeRequest, provider: PaymentProvider): Promise<ChargeResponse> {
        const p = this.getProvider(provider);
        logger.info({ externalId: request.externalId, provider: p.providerName }, "[PaymentService] Criando cobrança...");
        return p.createCharge(request);
    }

    async cancelCharge(providerId: string, provider: PaymentProvider): Promise<boolean> {
        if (!providerId) return true;
        return this.getProvider(provider).cancelCharge(providerId);
    }

    async processWebhook(provider: PaymentProvider, rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> {
        return await this.getProvider(provider).normalizeWebhook(rawBody);
    }
}

export const paymentService = new PaymentService();
