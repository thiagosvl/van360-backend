import { CheckoutPaymentMethod, PaymentProvider, NormalizedPaymentEventType, ContractMultaTipo, CobrancaTipoPagamento } from "./enums.js";

export interface CreateChargeRequest {
    externalId: string;
    amount: number;
    description: string;
    paymentMethod: CheckoutPaymentMethod;
    installments?: number;
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
    daysAfterDueDate?: number;
    fines?: {
        value: number;
        tipo?: ContractMultaTipo;
    };
    interests?: {
        value: number;
        tipo?: ContractMultaTipo;
    };
    splits?: ChargeSplitEntry[];
}

export interface ChargeSplitEntry {
    pix_chave: string;
    amount: number;
    description?: string;
    splitType?: "SPLIT_SUB_ACCOUNT" | "SPLIT_INTERNAL_TRANSFER";
}

export interface ChargeResponse {
    success: boolean;
    providerId?: string;
    status?: string;
    pixCopyPaste?: string;
    pixQrCodeUrl?: string;
    paymentLink?: string;
    invoiceUrl?: string;
    boletoLinhaDigitavel?: string;
    boletoCodigoBarras?: string;
    boletoNossoNumero?: string;
    error?: string;
    isUserFacing?: boolean;
}

export interface NormalizedPaymentEvent {
    type: NormalizedPaymentEventType;
    internalId: string;
    providerRef: string;
    amount?: number;
    paidAt?: Date;
    paymentMethod?: CobrancaTipoPagamento;
    raw?: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
    readonly providerName: PaymentProvider;
    createCharge(request: CreateChargeRequest): Promise<ChargeResponse>;
    cancelCharge(providerId: string, options?: Record<string, unknown>): Promise<boolean>;
    getChargeStatus(providerId: string, options?: Record<string, unknown>): Promise<string>;
    normalizeWebhook(rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> | NormalizedPaymentEvent | null;
}
