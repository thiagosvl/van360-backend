import { CreateChargeRequest, ChargeResponse, NormalizedPaymentEvent, PaymentProviderAdapter } from "../../types/payment.js";
import { DummyPaymentProvider } from "./providers/dummy-payment.provider.js";
import { AppError } from "../../errors/AppError.js";
import { logger } from "../../config/logger.js";

/**
 * PaymentService — Orquestrador de Pagamentos (Skeleton)
 * 
 * ESTADO ATUAL: Desconectado. Nenhum serviço chama este módulo ainda.
 * 
 * QUANDO CONECTAR:
 * - Fase "Assinatura SaaS": para cobrar a assinatura do motorista
 * - Fase "Add-on Cobrança Automática": para gerar PIX das mensalidades dos passageiros
 * 
 * O provider ativo é injetado via registro. Quando um provider real for escolhido
 * (Asaas, EfiPay, Stark Bank), basta criar o adapter e registrar aqui.
 */
class PaymentService {
    private providers: Map<string, PaymentProviderAdapter> = new Map();
    private defaultProvider: string = "dummy";

    constructor() {
        this.register(new DummyPaymentProvider());
    }

    register(provider: PaymentProviderAdapter): void {
        this.providers.set(provider.providerName, provider);
        logger.info({ provider: provider.providerName }, "[PaymentService] Provider registrado");
    }

    private getProvider(name?: string): PaymentProviderAdapter {
        const providerName = name || this.defaultProvider;
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new AppError(`Provider de pagamento '${providerName}' não registrado.`, 500);
        }
        return provider;
    }

    async createCharge(request: CreateChargeRequest, providerName?: string): Promise<ChargeResponse> {
        const provider = this.getProvider(providerName);
        logger.info({ externalId: request.externalId, provider: provider.providerName }, "[PaymentService] Criando cobrança...");
        return provider.createCharge(request);
    }

    async cancelCharge(providerId: string, providerName?: string): Promise<boolean> {
        if (!providerId) return true;
        const provider = this.getProvider(providerName);
        return provider.cancelCharge(providerId);
    }

    /**
     * Processa um webhook bruto delegando para o adapter correto.
     * Retorna o evento normalizado (agnóstico de provider).
     */
    processWebhook(providerName: string, rawBody: Record<string, unknown>): NormalizedPaymentEvent | null {
        const provider = this.getProvider(providerName);
        return provider.normalizeWebhook(rawBody);
    }
}

export const paymentService = new PaymentService();
