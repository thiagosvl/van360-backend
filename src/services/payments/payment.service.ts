import { CreateChargeRequest, ChargeResponse, NormalizedPaymentEvent, PaymentProviderAdapter } from "../../types/payment.js";
import { PaymentProvider } from "../../types/enums.js";
import { EfipayProvider } from "./providers/efipay.provider.js";
import { WooviProvider, WooviWithdrawResponse } from "./providers/woovi.provider.js";
import { AppError } from "../../errors/AppError.js";
import { logger } from "../../config/logger.js";

class PaymentService {
    private providers: Map<PaymentProvider, PaymentProviderAdapter> = new Map();
    private wooviProviderInstance: WooviProvider;

    constructor() {
        this.register(new EfipayProvider());
        this.wooviProviderInstance = new WooviProvider();
        this.register(this.wooviProviderInstance);
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

    async getChargeStatus(providerId: string, provider: PaymentProvider): Promise<string> {
        return this.getProvider(provider).getChargeStatus(providerId);
    }

    async processWebhook(provider: PaymentProvider, rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> {
        return await this.getProvider(provider).normalizeWebhook(rawBody);
    }

    async ensureSubaccount(pixKey: string, name?: string): Promise<boolean> {
        return this.wooviProviderInstance.createOrEnsureSubaccount(pixKey, name);
    }

    async getSubaccountBalance(pixKey: string): Promise<number> {
        return this.wooviProviderInstance.getSubaccountBalance(pixKey);
    }

    async withdrawFromSubaccount(pixKey: string, amountInCents: number): Promise<WooviWithdrawResponse> {
        return this.wooviProviderInstance.withdrawFromSubaccount(pixKey, amountInCents);
    }
}

export const paymentService = new PaymentService();

