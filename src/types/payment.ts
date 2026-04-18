import { CheckoutPaymentMethod, PaymentProvider } from "./enums.js";

export interface CreateChargeRequest {
    externalId: string;
    amount: number;
    description: string;
    paymentMethod: CheckoutPaymentMethod;
    paymentToken?: string;
    customer: {
        name: string;
        document: string;
        email?: string;
        phone?: string;
        birth?: string;
    };
    billingAddress?: {
        street: string;
        number: string;
        neighborhood: string;
        zipcode: string;
        city: string;
        state: string;
    };
    dueDate: string;
    splits?: ChargeSplitEntry[];
}

export interface ChargeSplitEntry {
    pix_chave: string;
    amount: number;
    description?: string;
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
    readonly providerName: PaymentProvider;
    createCharge(request: CreateChargeRequest): Promise<ChargeResponse>;
    cancelCharge(providerId: string): Promise<boolean>;
    getChargeStatus(providerId: string): Promise<string>;
    normalizeWebhook(rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> | NormalizedPaymentEvent | null;
}
