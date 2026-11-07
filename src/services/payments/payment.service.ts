import { CreateChargeRequest, ChargeResponse, NormalizedPaymentEvent, PaymentProviderAdapter } from "../../types/payment.js";
import { PaymentProvider } from "../../types/enums.js";
import { EfipayProvider } from "./providers/efipay.provider.js";
import { WooviProvider, WooviWithdrawResponse } from "./providers/woovi.provider.js";
import { BancoDoBrasilProvider } from "./providers/banco-do-brasil.provider.js";
import { AppError } from "../../errors/AppError.js";
import { logger } from "../../config/logger.js";
import { errorAlertService } from "../error-alert.service.js";

class PaymentService {
    private providers: Map<PaymentProvider, PaymentProviderAdapter> = new Map();
    private wooviProviderInstance: WooviProvider;

    constructor() {
        this.register(new EfipayProvider());
        this.wooviProviderInstance = new WooviProvider();
        this.register(this.wooviProviderInstance);
        this.register(new BancoDoBrasilProvider());
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
        try {
            const res = await p.createCharge(request);
            if (!res.success) {
                void errorAlertService.notifyPaymentError({
                    provider,
                    error: res.error || "Falha desconhecida ao criar cobrança",
                    externalId: request.externalId,
                    paymentMethod: request.paymentMethod,
                    amount: `R$ ${request.amount.toFixed(2)}`,
                    details: {
                        operacao: "createCharge",
                        descricao: request.description,
                        pagador: request.customer?.name
                    }
                });
            }
            return res;
        } catch (error: unknown) {
            void errorAlertService.notifyPaymentError({
                provider,
                error,
                externalId: request.externalId,
                paymentMethod: request.paymentMethod,
                amount: `R$ ${request.amount.toFixed(2)}`,
                details: {
                    operacao: "createCharge",
                    descricao: request.description,
                    pagador: request.customer?.name
                }
            });
            throw error;
        }
    }

    async cancelCharge(providerId: string, provider: PaymentProvider, options?: Record<string, unknown>): Promise<boolean> {
        if (!providerId) return true;
        return this.getProvider(provider).cancelCharge(providerId, options);
    }

    async getChargeStatus(providerId: string, provider: PaymentProvider, options?: Record<string, unknown>): Promise<string> {
        return this.getProvider(provider).getChargeStatus(providerId, options);
    }

    async processWebhook(provider: PaymentProvider, rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> {
        return await this.getProvider(provider).normalizeWebhook(rawBody);
    }

    async ensureSubaccount(pixKey: string, name?: string): Promise<boolean> {
        try {
            return await this.wooviProviderInstance.createOrEnsureSubaccount(pixKey, name);
        } catch (error: unknown) {
            void errorAlertService.notifyPaymentError({
                provider: PaymentProvider.WOOVI,
                error,
                details: {
                    operacao: "ensureSubaccount",
                    pixKey,
                    nome: name
                }
            });
            throw error;
        }
    }

    async getSubaccountBalance(pixKey: string): Promise<number> {
        try {
            return await this.wooviProviderInstance.getSubaccountBalance(pixKey);
        } catch (error: unknown) {
            void errorAlertService.notifyPaymentError({
                provider: PaymentProvider.WOOVI,
                error,
                details: {
                    operacao: "getSubaccountBalance",
                    pixKey
                }
            });
            throw error;
        }
    }

    async withdrawFromSubaccount(pixKey: string, amountInCents: number): Promise<WooviWithdrawResponse> {
        const res = await this.wooviProviderInstance.withdrawFromSubaccount(pixKey, amountInCents);
        if (!res.success) {
            void errorAlertService.notifyPaymentError({
                provider: PaymentProvider.WOOVI,
                error: res.error || "Falha no saque da subconta",
                amount: `R$ ${(amountInCents / 100).toFixed(2)}`,
                details: {
                    operacao: "withdrawFromSubaccount",
                    pixKey
                }
            });
        }
        return res;
    }

    async creditSubaccount(pixKey: string, amountInCents: number): Promise<{ success: boolean; error?: string }> {
        const res = await this.wooviProviderInstance.creditSubaccount(pixKey, amountInCents);
        if (!res.success) {
            void errorAlertService.notifyPaymentError({
                provider: PaymentProvider.WOOVI,
                error: res.error || "Falha no crédito da subconta",
                amount: `R$ ${(amountInCents / 100).toFixed(2)}`,
                details: {
                    operacao: "creditSubaccount",
                    pixKey
                }
            });
        }
        return res;
    }
}

export const paymentService = new PaymentService();

