import axios, { AxiosInstance } from "axios";
import { PaymentProvider, NormalizedPaymentEventType } from "../../../types/enums.js";
import { AppError } from "../../../errors/AppError.js";
import { logger } from "../../../config/logger.js";
import {
    ChargeResponse,
    CreateChargeRequest,
    NormalizedPaymentEvent,
    PaymentProviderAdapter
} from "../../../types/payment.js";

export interface WooviSubaccount {
    pixKey: string;
    balance: number;
    name?: string;
}

export interface WooviWithdrawResponse {
    success: boolean;
    endToEndId?: string;
    transactionId?: string;
    error?: string;
}

export class WooviProvider implements PaymentProviderAdapter {
    readonly providerName = PaymentProvider.WOOVI;
    private client: AxiosInstance;

    constructor() {
        const appId = process.env.WOOVI_APP_ID;
        const baseURL = process.env.WOOVI_BASE_URL || "https://api.woovi.com/api/v1";

        this.client = axios.create({
            baseURL,
            headers: {
                Authorization: appId || "",
                "Content-Type": "application/json"
            },
            timeout: 20000
        });
    }

    async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
        try {
            const valueInCents = Math.round(request.amount * 100);

            const splitsPayload = request.splits?.map((split) => ({
                pixKey: split.pix_chave,
                value: Math.round(split.amount * 100),
                splitType: split.splitType || "SPLIT_SUB_ACCOUNT"
            }));

            const payload: Record<string, unknown> = {
                correlationID: request.externalId,
                value: valueInCents,
                comment: request.description.substring(0, 140),
                expiresIn: 1296000
            };

            if (splitsPayload && splitsPayload.length > 0) {
                payload.splits = splitsPayload;
            }

            if (request.customer) {
                payload.customer = {
                    name: request.customer.name,
                    taxID: request.customer.document?.replace(/\D/g, ""),
                    email: request.customer.email,
                    phone: request.customer.phone?.replace(/\D/g, "")
                };
            }

            const response = await this.client.post("/charge", payload);
            const charge = response.data?.charge;

            if (!charge) {
                throw new AppError("Resposta inválida da Woovi ao criar cobrança.", 502);
            }

            return {
                success: true,
                providerId: charge.correlationID,
                status: charge.status,
                pixCopyPaste: charge.brCode,
                pixQrCodeUrl: charge.qrCodeImage,
                paymentLink: charge.paymentLinkUrl
            };
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
            const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || "Erro desconhecido";
            logger.error({ error: errorMessage, externalId: request.externalId }, "[WooviProvider] Falha ao criar cobrança Pix");
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    async cancelCharge(providerId: string): Promise<boolean> {
        try {
            await this.client.delete(`/charge/${encodeURIComponent(providerId)}`);
            return true;
        } catch (error: unknown) {
            const err = error as { response?: { status?: number; data?: unknown }; message?: string };
            if (err.response?.status === 404) {
                return true;
            }
            logger.warn({ error: err.message, providerId }, "[WooviProvider] Falha ao cancelar cobrança");
            return false;
        }
    }

    async getChargeStatus(providerId: string): Promise<string> {
        const response = await this.client.get(`/charge/${encodeURIComponent(providerId)}`);
        return response.data?.charge?.status || "UNKNOWN";
    }

    async createOrEnsureSubaccount(pixKey: string): Promise<boolean> {
        try {
            const listResponse = await this.client.get("/subaccount");
            const subAccounts: WooviSubaccount[] = listResponse.data?.subAccounts || [];
            const exists = subAccounts.some((sub) => sub.pixKey === pixKey);

            if (exists) {
                return true;
            }

            await this.client.post("/subaccount", { pixKey });
            logger.info({ pixKey }, "[WooviProvider] Subconta criada com sucesso");
            return true;
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
            const msg = err.response?.data?.error || err.response?.data?.message || err.message;
            if (typeof msg === "string" && msg.toLowerCase().includes("already exists")) {
                return true;
            }
            logger.error({ error: msg, pixKey }, "[WooviProvider] Falha ao criar subconta");
            throw new AppError(`Não foi possível registrar a chave Pix na instituição financeira: ${msg}`, 400);
        }
    }

    async getSubaccountBalance(pixKey: string): Promise<number> {
        try {
            const response = await this.client.get("/subaccount");
            const subAccounts: WooviSubaccount[] = response.data?.subAccounts || [];
            const sub = subAccounts.find((s) => s.pixKey === pixKey);
            return sub ? sub.balance / 100 : 0;
        } catch (error: unknown) {
            const err = error as { message?: string };
            logger.error({ error: err.message, pixKey }, "[WooviProvider] Falha ao consultar saldo da subconta");
            return 0;
        }
    }

    async withdrawFromSubaccount(pixKey: string, amountInCents: number): Promise<WooviWithdrawResponse> {
        try {
            const encodedPixKey = encodeURIComponent(pixKey);
            const response = await this.client.post(`/subaccount/${encodedPixKey}/withdraw`, {
                value: amountInCents
            });

            const data = response.data;
            return {
                success: true,
                endToEndId: data?.endToEndId || data?.transaction?.endToEndId,
                transactionId: data?.transactionId || data?.id
            };
        } catch (error: unknown) {
            const err = error as { response?: { data?: { error?: string; message?: string } }; message?: string };
            const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || "Erro no saque";
            logger.error({ error: errorMsg, pixKey, amountInCents }, "[WooviProvider] Falha ao executar saque da subconta");
            return {
                success: false,
                error: errorMsg
            };
        }
    }

    normalizeWebhook(rawBody: Record<string, unknown>): NormalizedPaymentEvent | null {
        const event = (rawBody.event as string) || "";
        const charge = rawBody.charge as Record<string, unknown> | undefined;

        if (
            event === "OPENPIX:CHARGE_COMPLETED" ||
            event === "charge:completed" ||
            event === "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER"
        ) {
            const correlationID = (charge?.correlationID as string) || (rawBody.correlationID as string) || "";
            const value = (charge?.value as number) || 0;
            const paidAtStr = (charge?.paidAt as string) || (charge?.updatedAt as string);

            return {
                type: NormalizedPaymentEventType.PAYMENT_RECEIVED,
                internalId: correlationID,
                providerRef: (charge?.transactionID as string) || correlationID,
                amount: value ? value / 100 : undefined,
                paidAt: paidAtStr ? new Date(paidAtStr) : new Date(),
                raw: rawBody
            };
        }

        return null;
    }
}
