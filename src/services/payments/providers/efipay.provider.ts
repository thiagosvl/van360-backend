import EfiPayModule from "gn-api-sdk-typescript";
// Hack para contornar incompatibilidade ESM/CJS do SDK da Efí
const EfiPay = (EfiPayModule as any).default || EfiPayModule;
import { logger } from "../../../config/logger.js";
import { getEfipayConfig } from "../../../config/efipay.js";
import { env } from "../../../config/env.js";
import {
    ChargeResponse,
    CreateChargeRequest,
    NormalizedPaymentEvent,
    PaymentProviderAdapter
} from "../../../types/payment.js";
import { CheckoutPaymentMethod, PaymentProvider } from "../../../types/enums.js";
import { parseLocalDate } from "../../../utils/date.utils.js";

export class EfipayProvider implements PaymentProviderAdapter {
    readonly providerName = PaymentProvider.EFIPAY;
    private efipay: any; // SDK sem tipos confiáveis após workaround ESM/CJS

    constructor() {
        const config = getEfipayConfig();
        this.efipay = new EfiPay({
            sandbox: config.sandbox,
            client_id: config.client_id,
            client_secret: config.client_secret,
            certificate: config.certificate,
        });
    }

    async createCharge(request: CreateChargeRequest): Promise<ChargeResponse> {
        try {
            logger.info({ externalId: request.externalId, method: request.paymentMethod }, "[EfipayProvider] Criando cobrança...");

            if (request.paymentMethod === CheckoutPaymentMethod.CREDIT_CARD) {
                if (!request.paymentToken) {
                    throw new Error("paymentToken é obrigatório para pagamento com cartão de crédito.");
                }
                if (!request.customer.phone) {
                    throw new Error("Telefone do cliente é obrigatório para pagamento com cartão.");
                }
                if (!request.customer.email) {
                    throw new Error("E-mail do cliente é obrigatório para pagamento com cartão.");
                }
                if (!request.customer.birth) {
                    throw new Error("Data de nascimento é obrigatória para pagamento com cartão.");
                }

                const body = {
                    items: [
                        {
                            name: request.description.substring(0, 255),
                            value: Math.round(request.amount * 100),
                            amount: 1
                        }
                    ],
                    metadata: {
                        custom_id: request.externalId,
                        notification_url: env.EFI_WEBHOOK_URL
                    },
                    payment: {
                        credit_card: {
                            installments: 1,
                            payment_token: request.paymentToken,
                            customer: {
                                name: request.customer.name,
                                [request.customer.document.replace(/\D/g, "").length > 11 ? "cnpj" : "cpf"]: request.customer.document.replace(/\D/g, ""),
                                phone_number: request.customer.phone.replace(/\D/g, ""),
                                email: request.customer.email,
                                birth: request.customer.birth,
                            },
                            billing_address: request.billingAddress || {
                                street: "Rua Não Informada",
                                number: "0",
                                neighborhood: "Centro",
                                zipcode: "01001000",
                                city: "São Paulo",
                                state: "SP"
                            }
                        }
                    }
                };

                const ccResponse = await this.efipay.createOneStepCharge([], body);

                const status = ccResponse.data?.status;
                const chargeId = ccResponse.data?.charge_id?.toString();

                if (status === "declined" || status === "unpaid") {
                    throw new Error("Cartão recusado pela operadora.");
                }

                return {
                    success: true,
                    providerId: chargeId, // Cartão usa charge_id em vez de txid
                };

            } else {
                const body = {
                    calendario: {
                        expiracao: 3600 * 24
                    },
                    devedor: {
                        [request.customer.document.replace(/\D/g, "").length > 11 ? "cnpj" : "cpf"]: request.customer.document.replace(/\D/g, ""),
                        nome: request.customer.name
                    },
                    valor: {
                        original: request.amount.toFixed(2)
                    },
                    chave: env.EFI_PIX_KEY,
                    solicitacaoPagador: request.description.substring(0, 140),
                    infoAdicionais: [
                        { nome: "Fatura", valor: request.externalId }
                    ],
                    ...(request.splits?.length ? {
                        split: request.splits.map(s => ({
                            chave: s.pix_chave,
                            valor: { original: s.amount.toFixed(2) }
                        }))
                    } : {})
                };

                const cobResponse = await this.efipay.pixCreateImmediateCharge([], body);

                if (!cobResponse.txid) {
                    throw new Error("Falha ao gerar txid na Efí");
                }

                const qrcodeResponse = await this.efipay.pixGenerateQRCode({
                    id: cobResponse.loc.id
                });

                return {
                    success: true,
                    providerId: cobResponse.txid,
                    pixCopyPaste: qrcodeResponse.qrcode,
                    pixQrCodeUrl: qrcodeResponse.imagemQrcode,
                };
            }
        } catch (error: any) {
            // Extrai a mensagem de erro mais detalhada da Efí se disponível
            const errorDetail = error?.error_description || error?.message || "Erro desconhecido na Efí Pay";
            
            logger.error({ 
                error: errorDetail, 
                fullError: error, // Loga o objeto completo para debug
                externalId: request.externalId 
            }, "[EfipayProvider] Erro ao criar cobrança");

            return { success: false, error: errorDetail };
        }
    }

    async cancelCharge(providerId: string): Promise<boolean> {
        const isCardCharge = /^\d+$/.test(providerId);
        if (isCardCharge) {
            try {
                await this.efipay.chargeRefund({ id: parseInt(providerId, 10) }, {});
                logger.info({ providerId }, "[EfipayProvider] Estorno de cartão solicitado.");
            } catch (error: unknown) {
                logger.error({ error: (error as Error).message, providerId }, "[EfipayProvider] Erro ao estornar cartão.");
                return false;
            }
        } else {
            logger.info({ providerId }, "[EfipayProvider] Cancelamento de Pix solicitado (expira automaticamente).");
        }
        return true;
    }

    async getChargeStatus(providerId: string): Promise<string> {
        const isCardCharge = /^\d+$/.test(providerId);
        try {
            if (isCardCharge) {
                const response = await this.efipay.detailCharge({ id: parseInt(providerId, 10) });
                return response.data?.status?.toLowerCase() ?? "error";
            }
            const response = await this.efipay.pixDetailCharge({ txid: providerId });
            return response.status.toLowerCase();
        } catch {
            return "error";
        }
    }

    private async getNotification(token: string): Promise<unknown> {
        return this.efipay.getNotification({ token });
    }

    async normalizeWebhook(rawBody: Record<string, unknown>): Promise<NormalizedPaymentEvent | null> {
        try {
            if (rawBody.pix && Array.isArray(rawBody.pix)) {
                const payment = rawBody.pix[0] as Record<string, unknown>;
                return {
                    type: "PAYMENT_RECEIVED",
                    internalId: payment.txid as string,
                    providerRef: payment.endToEndId as string,
                    amount: parseFloat(payment.valor as string),
                    paidAt: parseLocalDate(payment.horario as string),
                    raw: rawBody
                };
            }

            if (rawBody.notification && typeof rawBody.notification === "string") {
                const token = rawBody.notification;
                logger.info({ token }, "[EfipayProvider] Consultando notificação de cartão...");

                const response = await this.getNotification(token) as { data?: Array<Record<string, unknown>> };

                if (response?.data && response.data.length > 0) {
                    const history = response.data;
                    const firstEntry = history[0] as Record<string, Record<string, unknown>>;
                    const lastLog = history[history.length - 1] as Record<string, Record<string, unknown>>;
                    const status = (lastLog.status as Record<string, unknown>)?.current as string;
                    const chargeId = (firstEntry.identifiers as Record<string, unknown>)?.charge_id?.toString();
                    const totalCents = (firstEntry.identifiers as Record<string, unknown>)?.total as number | undefined;
                    const amount = totalCents ? totalCents / 100 : undefined;
                    const paidAtRaw = lastLog.created_at as unknown as string | undefined;
                    const paidAt = paidAtRaw ? parseLocalDate(paidAtRaw) : undefined;

                    if (status === "approved" || status === "paid") {
                        return {
                            type: "PAYMENT_RECEIVED",
                            internalId: chargeId ?? "",
                            providerRef: lastLog.id?.toString() ?? "",
                            amount,
                            paidAt,
                            raw: response.data as unknown as Record<string, unknown>
                        };
                    } else if (status === "declined" || status === "unpaid" || status === "canceled") {
                        return {
                            type: "PAYMENT_FAILED",
                            internalId: chargeId ?? "",
                            providerRef: lastLog.id?.toString() ?? "",
                            raw: response.data as unknown as Record<string, unknown>
                        };
                    }
                }
            }

            return null;
        } catch (error: unknown) {
            logger.error({ error: (error as Error).message }, "[EfipayProvider] Erro ao normalizar webhook");
            return null;
        }
    }
}
