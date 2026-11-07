import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { PaymentProvider, NormalizedPaymentEventType, ContractMultaTipo } from "../../../types/enums.js";
import { AppError } from "../../../errors/AppError.js";
import { logger } from "../../../config/logger.js";
import { env } from "../../../config/env.js";
import { redisClient } from "../../../config/redis.js";
import {
    ChargeResponse,
    CreateChargeRequest,
    NormalizedPaymentEvent,
    PaymentProviderAdapter
} from "../../../types/payment.js";
import { getEndOfDayBR } from "../../../utils/date.utils.js";

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

interface RetryableAxiosConfig extends InternalAxiosRequestConfig {
    _retryCount?: number;
}

const WOOVI_SUBACCOUNT_CACHE_PREFIX = "woovi:subaccount:verified:";
const WOOVI_SUBACCOUNT_CACHE_TTL_SECONDS = 86400;
const WOOVI_MAX_RETRIES = 3;
const WOOVI_BASE_RETRY_DELAY_MS = 1500;

export class WooviProvider implements PaymentProviderAdapter {
    readonly providerName = PaymentProvider.WOOVI;
    private client: AxiosInstance;
    private inFlightSubaccountChecks = new Map<string, Promise<boolean>>();

    constructor() {
        const appId = env.WOOVI_APP_ID || process.env.WOOVI_APP_ID;
        const baseURL = env.WOOVI_BASE_URL || process.env.WOOVI_BASE_URL || "https://api.woovi.com/api/v1";

        this.client = axios.create({
            baseURL,
            headers: {
                Authorization: appId || "",
                "Content-Type": "application/json"
            },
            timeout: 20000
        });

        this.client.interceptors.response.use(
            (response) => response,
            async (error: AxiosError<{ error?: unknown; message?: unknown }>) => {
                const config = error.config as RetryableAxiosConfig | undefined;
                if (!config) {
                    return Promise.reject(error);
                }

                const status = error.response?.status;
                const errorText = this.extractErrorString(error, "").toLowerCase();
                const isRateLimit = status === 429 || errorText.includes("muitas requisições") || errorText.includes("too many requests");
                const isTransientGateway = status === 502 || status === 503 || status === 504;

                const currentRetry = config._retryCount || 0;
                if ((isRateLimit || isTransientGateway) && currentRetry < WOOVI_MAX_RETRIES) {
                    config._retryCount = currentRetry + 1;
                    const delayMs = WOOVI_BASE_RETRY_DELAY_MS * Math.pow(2, currentRetry);
                    logger.warn(
                        { url: config.url, status, attempt: config._retryCount, delayMs },
                        "[WooviProvider] Rate limit ou falha transitória detectada, aguardando para retentar"
                    );
                    await new Promise((resolve) => setTimeout(resolve, delayMs));
                    return this.client.request(config);
                }

                return Promise.reject(error);
            }
        );
    }

    private extractErrorString(error: unknown, fallback = "Erro desconhecido"): string {
        const err = error as {
            response?: { data?: { error?: unknown; message?: unknown; errors?: Array<{ message?: string }> } };
            message?: string;
        };
        const rawError = err?.response?.data?.error ?? err?.response?.data?.message ?? err?.response?.data?.errors?.[0]?.message;
        if (typeof rawError === "string" && rawError.trim().length > 0) {
            return rawError;
        }
        if (rawError && typeof rawError === "object") {
            const nestedMsg = (rawError as { message?: unknown; error?: unknown }).message ?? (rawError as { error?: unknown }).error;
            if (typeof nestedMsg === "string" && nestedMsg.trim().length > 0) {
                return nestedMsg;
            }
            return JSON.stringify(rawError);
        }
        if (typeof err?.message === "string" && err.message.trim().length > 0) {
            return err.message;
        }
        return fallback;
    }

    private sanitizePixKey(pixKey: string): string {
        const trimmed = pixKey.trim();
        if (trimmed.startsWith("+55")) {
            const digits = trimmed.replace(/\D/g, "");
            return `+${digits}`;
        }
        if (trimmed.includes("(") || trimmed.includes(")")) {
            const digits = trimmed.replace(/\D/g, "");
            if (digits.length >= 10 && digits.length <= 11) {
                return `+55${digits}`;
            }
        }
        if (!trimmed.includes("@") && /[.\-/ ]/.test(trimmed)) {
            const digits = trimmed.replace(/\D/g, "");
            if (digits.length >= 10 && digits.length <= 14) {
                return digits;
            }
        }
        return trimmed;
    }

    private matchesPixKey(keyA: string, keyB: string): boolean {
        if (!keyA || !keyB) return false;
        const cleanA = keyA.trim().toLowerCase();
        const cleanB = keyB.trim().toLowerCase();
        if (cleanA === cleanB) return true;

        if (cleanA.includes("@") || cleanB.includes("@")) {
            return cleanA === cleanB;
        }

        const digitsA = cleanA.replace(/\D/g, "");
        const digitsB = cleanB.replace(/\D/g, "");
        if (!digitsA || !digitsB) return false;
        if (digitsA === digitsB) return true;

        if ((digitsA.length === 10 || digitsA.length === 11) && digitsB === `55${digitsA}`) return true;
        if ((digitsB.length === 10 || digitsB.length === 11) && digitsA === `55${digitsB}`) return true;

        return false;
    }

    private async findWooviSubaccount(pixKey: string, throwOnError = false): Promise<WooviSubaccount | null> {
        const sanitizedKey = this.sanitizePixKey(pixKey);
        const cachedKey = await this.getCachedSubaccountKey(sanitizedKey);
        const directCandidate = cachedKey || sanitizedKey;

        try {
            const directRes = await this.client.get(`/subaccount/${encodeURIComponent(directCandidate)}`);
            const directSub = directRes.data?.subAccount as WooviSubaccount | undefined;
            if (directSub && directSub.pixKey) {
                return directSub;
            }
        } catch (directErr: unknown) {
            const status = (directErr as { response?: { status?: number } })?.response?.status;
            if (status && status !== 404 && status !== 400 && throwOnError) {
                throw directErr;
            }
        }

        try {
            let skip = 0;
            const limit = 100;
            for (let page = 0; page < 5; page++) {
                const response = await this.client.get("/subaccount", { params: { skip, limit } });
                const subAccounts: WooviSubaccount[] = response.data?.subAccounts || [];
                const found = subAccounts.find((s) => this.matchesPixKey(s.pixKey, pixKey));
                if (found) return found;
                if (subAccounts.length < limit) break;
                skip += limit;
            }
            return null;
        } catch (error: unknown) {
            const errMsg = this.extractErrorString(error);
            logger.warn({ error: errMsg, pixKey }, "[WooviProvider] Falha ao listar subcontas para busca");
            if (throwOnError) {
                throw error;
            }
            return null;
        }
    }

    private async cacheVerifiedSubaccount(sanitizedKey: string, targetPixKey: string): Promise<void> {
        try {
            await redisClient.setex(`${WOOVI_SUBACCOUNT_CACHE_PREFIX}${sanitizedKey}`, WOOVI_SUBACCOUNT_CACHE_TTL_SECONDS, targetPixKey);
        } catch (err: unknown) {
            logger.warn({ error: err instanceof Error ? err.message : String(err), pixKey: sanitizedKey }, "[WooviProvider] Falha ao salvar subconta no cache Redis");
        }
    }

    private async getCachedSubaccountKey(sanitizedKey: string): Promise<string | null> {
        try {
            return await redisClient.get(`${WOOVI_SUBACCOUNT_CACHE_PREFIX}${sanitizedKey}`);
        } catch {
            return null;
        }
    }

    private async resolveSubaccountTargetKey(pixKey: string): Promise<string> {
        const sanitizedKey = this.sanitizePixKey(pixKey);
        const cachedTargetKey = await this.getCachedSubaccountKey(sanitizedKey);
        if (cachedTargetKey) return cachedTargetKey;
        const sub = await this.findWooviSubaccount(pixKey);
        if (sub) {
            await this.cacheVerifiedSubaccount(sanitizedKey, sub.pixKey);
            return sub.pixKey;
        }
        return sanitizedKey;
    }

    async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
        try {
            const valueInCents = Math.round(request.amount * 100);

            const splitsPayload = request.splits?.map((split) => ({
                pixKey: this.sanitizePixKey(split.pix_chave),
                value: Math.round(split.amount * 100),
                splitType: split.splitType || "SPLIT_SUB_ACCOUNT"
            }));

            const cleanTaxId = request.customer?.document?.replace(/\D/g, "");
            const hasValidTaxId = Boolean(cleanTaxId && (cleanTaxId.length === 11 || cleanTaxId.length === 14));
            const hasOverdueRules = Boolean(request.fines || request.interests);

            if (hasOverdueRules && !hasValidTaxId) {
                return {
                    success: false,
                    error: "CPF/CNPJ do responsável é obrigatório para registrar cobrança com multa e juros no Banco Central."
                };
            }

            const payload: Record<string, unknown> = {
                correlationID: request.externalId,
                value: valueInCents,
                comment: request.description.substring(0, 140),
            };

            const targetDueDate = request.dueDate.includes("T")
                ? new Date(request.dueDate)
                : getEndOfDayBR(request.dueDate);
            const now = new Date();

            if (hasOverdueRules) {
                payload.type = "OVERDUE";
                payload.dueDate = targetDueDate.toISOString();
                payload.daysForDueDate = Math.max(0, Math.ceil((targetDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
                payload.daysAfterDueDate = request.daysAfterDueDate || 30;

                if (request.fines) {
                    const fineBasisPoints = request.fines.tipo === ContractMultaTipo.PERCENTUAL
                        ? Math.round(request.fines.value * 100)
                        : (request.amount > 0 ? Math.round((request.fines.value / request.amount) * 10000) : 0);
                    payload.fines = {
                        value: fineBasisPoints
                    };
                }

                if (request.interests) {
                    const interestBasisPoints = request.interests.tipo === ContractMultaTipo.PERCENTUAL
                        ? Math.round(request.interests.value * 100)
                        : (request.amount > 0 ? Math.round((request.interests.value / request.amount) * 10000) : 0);
                    payload.interests = {
                        value: interestBasisPoints
                    };
                }
            } else {
                const diffInSeconds = Math.floor((targetDueDate.getTime() - now.getTime()) / 1000);
                payload.expiresIn = Math.max(3600, diffInSeconds + 15 * 86400);
            }

            if (splitsPayload && splitsPayload.length > 0) {
                await Promise.all(
                    splitsPayload.map((s) => this.createOrEnsureSubaccount(s.pixKey))
                );
                payload.splits = splitsPayload;
            }

            if (request.customer) {
                const customerPayload: Record<string, unknown> = {
                    name: request.customer.name,
                };
                if (hasValidTaxId) {
                    customerPayload.taxID = cleanTaxId;
                }
                if (request.customer.email) {
                    customerPayload.email = request.customer.email;
                }
                if (request.customer.phone) {
                    const cleanPhone = request.customer.phone.replace(/\D/g, "");
                    if (cleanPhone.length >= 10) {
                        customerPayload.phone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;
                    }
                }
                payload.customer = customerPayload;
            }

            const response = await this.client.post("/charge", payload);
            const charge = response.data?.charge;

            if (!charge) {
                return {
                    success: false,
                    error: "Resposta inválida da Woovi ao criar cobrança."
                };
            }

            return {
                success: true,
                providerId: charge.correlationID || request.externalId,
                pixCopyPaste: charge.brCode,
                pixQrCodeUrl: charge.qrCodeImage,
                invoiceUrl: charge.paymentLinkUrl
            };
        } catch (error: unknown) {
            const errorMessage = this.extractErrorString(error);
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
            logger.warn({ error: this.extractErrorString(error), providerId }, "[WooviProvider] Falha ao cancelar cobrança");
            return false;
        }
    }

    async getChargeStatus(providerId: string): Promise<string> {
        const response = await this.client.get(`/charge/${encodeURIComponent(providerId)}`);
        return response.data?.charge?.status || "UNKNOWN";
    }

    async createOrEnsureSubaccount(pixKey: string, name?: string): Promise<boolean> {
        const sanitizedKey = this.sanitizePixKey(pixKey);
        const cached = await this.getCachedSubaccountKey(sanitizedKey);
        if (cached) {
            return true;
        }

        const inFlight = this.inFlightSubaccountChecks.get(sanitizedKey);
        if (inFlight) {
            return inFlight;
        }

        const checkPromise = (async (): Promise<boolean> => {
            try {
                const existing = await this.findWooviSubaccount(pixKey);
                if (existing) {
                    await this.cacheVerifiedSubaccount(sanitizedKey, existing.pixKey);
                    return true;
                }

                const subaccountName = (name && name.trim()) || `Motorista ${sanitizedKey}`;
                await this.client.post("/subaccount", {
                    name: subaccountName.substring(0, 100),
                    pixKey: sanitizedKey
                });
                await this.cacheVerifiedSubaccount(sanitizedKey, sanitizedKey);
                logger.info({ pixKey: sanitizedKey, name: subaccountName }, "[WooviProvider] Subconta criada com sucesso");
                return true;
            } catch (error: unknown) {
                const err = error as { response?: { status?: number; data?: unknown }; message?: string };
                const msg = this.extractErrorString(error);
                const lowerMsg = msg.toLowerCase();
                if (lowerMsg.includes("already exists") || lowerMsg.includes("já existe") || lowerMsg.includes("já cadastrada")) {
                    await this.cacheVerifiedSubaccount(sanitizedKey, sanitizedKey);
                    return true;
                }
                logger.error({ status: err.response?.status, responseData: err.response?.data, error: msg, pixKey }, "[WooviProvider] Falha ao criar subconta");
                throw new AppError(`Não foi possível registrar a chave Pix na instituição financeira: ${msg}`, 400);
            } finally {
                this.inFlightSubaccountChecks.delete(sanitizedKey);
            }
        })();

        this.inFlightSubaccountChecks.set(sanitizedKey, checkPromise);
        return checkPromise;
    }

    async getSubaccountBalance(pixKey: string): Promise<number> {
        const sub = await this.findWooviSubaccount(pixKey, true);
        if (sub) {
            await this.cacheVerifiedSubaccount(this.sanitizePixKey(pixKey), sub.pixKey);
            return sub.balance / 100;
        }
        return 0;
    }

    async withdrawFromSubaccount(pixKey: string, amountInCents: number): Promise<WooviWithdrawResponse> {
        try {
            const targetKey = await this.resolveSubaccountTargetKey(pixKey);
            const response = await this.client.post(`/subaccount/${encodeURIComponent(targetKey)}/withdraw`, { value: amountInCents });
            const data = response.data;
            const endToEndId = data?.endToEndId || data?.transaction?.endToEndId;
            return {
                success: true,
                endToEndId,
                transactionId: data?.transactionId || data?.id || data?.transaction?.correlationID || data?.transaction?.id || endToEndId
            };
        } catch (error: unknown) {
            const errorMsg = this.extractErrorString(error, "Erro no saque");
            logger.error({ error: errorMsg, pixKey, amountInCents }, "[WooviProvider] Falha ao executar saque da subconta");
            return { success: false, error: errorMsg };
        }
    }

    async creditSubaccount(pixKey: string, amountInCents: number): Promise<{ success: boolean; error?: string }> {
        try {
            const targetKey = await this.resolveSubaccountTargetKey(pixKey);
            await this.client.post(`/subaccount/${encodeURIComponent(targetKey)}/credit`, { value: amountInCents });
            return { success: true };
        } catch (error: unknown) {
            const errorMsg = this.extractErrorString(error, "Erro no crédito da subconta");
            logger.error({ error: errorMsg, pixKey, amountInCents }, "[WooviProvider] Falha ao creditar subconta");
            return { success: false, error: errorMsg };
        }
    }

    normalizeWebhook(rawBody: Record<string, unknown>): NormalizedPaymentEvent | null {
        const event = (rawBody.event as string) || "";
        const charge = rawBody.charge as Record<string, unknown> | undefined;
        const pix = rawBody.pix as Record<string, unknown> | undefined;

        if (
            event === "OPENPIX:CHARGE_COMPLETED" ||
            event === "charge:completed" ||
            event === "OPENPIX:CHARGE_COMPLETED_NOT_SAME_CUSTOMER_PAYER"
        ) {
            const correlationID = (charge?.correlationID as string) || (rawBody.correlationID as string) || "";
            const value = (pix?.value as number) || (charge?.value as number) || 0;
            const paidAtStr = (pix?.time as string) || (charge?.paidAt as string) || (charge?.updatedAt as string);

            return {
                type: NormalizedPaymentEventType.PAYMENT_RECEIVED,
                internalId: correlationID,
                providerRef: (pix?.endToEndId as string) || (charge?.transactionID as string) || correlationID,
                amount: value ? value / 100 : undefined,
                paidAt: paidAtStr ? new Date(paidAtStr) : new Date(),
                raw: rawBody
            };
        }

        return null;
    }
}
