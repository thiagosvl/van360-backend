/**
 * Tipos e Interfaces do módulo de Pagamentos (Skeleton)
 * 
 * IMPORTANTE: Este módulo ainda NÃO está conectado a nenhum serviço real.
 * As interfaces aqui definidas servem como contrato para quando um provider
 * de pagamento for escolhido (Asaas, EfiPay, Stark Bank, etc).
 * 
 * Fluxo futuro:
 * 1. CobrancaService cria cobrança → chama PaymentService.createCharge()
 * 2. PaymentService delega para o Provider ativo (ex: AsaasAdapter)
 * 3. Provider retorna dados de PIX/Boleto/Link
 * 4. Webhook do Provider chega → WebhookController normaliza → SubscriptionService processa
 */

export interface CreateChargeRequest {
    externalId: string;
    amount: number;
    description: string;
    customer: {
        name: string;
        document: string;
        email?: string;
        phone?: string;
    };
    dueDate: string;
}

export interface ChargeResponse {
    success: boolean;
    providerId?: string;
    pixCopyPaste?: string;
    pixQrCodeUrl?: string;
    paymentLink?: string;
    invoiceUrl?: string;
    error?: string;
}

export interface NormalizedPaymentEvent {
    type: "PAYMENT_RECEIVED" | "PAYMENT_FAILED" | "PAYMENT_REFUNDED" | "SUBSCRIPTION_CREATED" | "SUBSCRIPTION_CANCELED" | "SUBSCRIPTION_EXPIRED";
    internalId: string;
    providerRef: string;
    amount?: number;
    paidAt?: Date;
    raw?: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
    readonly providerName: string;
    createCharge(request: CreateChargeRequest): Promise<ChargeResponse>;
    cancelCharge(providerId: string): Promise<boolean>;
    getChargeStatus(providerId: string): Promise<string>;
    normalizeWebhook(rawBody: Record<string, unknown>): NormalizedPaymentEvent | null;
}
