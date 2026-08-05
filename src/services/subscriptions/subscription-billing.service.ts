import { logger } from "../../config/logger.js";
import {
    SubscriptionInvoiceStatus,
    CheckoutPaymentMethod,
    ConfigKey,
    AtividadeAcao,
    AtividadeEntidadeTipo,
    PaymentProvider,
    SubscriptionIdentifer
} from "../../types/enums.js";
import { getConfig, getConfigNumber } from "../configuracao.service.js";
import { historicoService } from "../historico.service.js";
import { getNowBR, toPersistenceString, addDays } from "../../utils/date.utils.js";
import { extractErrorMessage } from "../../utils/string.utils.js";
import type { CreateInvoiceDTO } from "../../types/dtos/subscription.dto.js";
import { subscriptionService } from "./subscription.service.js";
import { planRepository } from "../../repositories/plan.repository.js";
import { referralRepository } from "../../repositories/referral.repository.js";
import { paymentMethodRepository } from "../../repositories/payment-method.repository.js";
import { invoiceRepository } from "../../repositories/invoice.repository.js";
import { subscriptionRepository } from "../../repositories/subscription.repository.js";
import { userRepository } from "../../repositories/user.repository.js";

export const subscriptionBillingService = {
    async calculatePrice(userId: string, planIdentificador: string): Promise<number> {
        const { data: plano } = await planRepository.getByIdentifier(planIdentificador);

        if (!plano) throw new Error(`Plano '${planIdentificador}' não encontrado.`);

        const sub = await subscriptionService.getOrCreateSubscription(userId);
        if (!sub) throw new Error("Erro ao obter assinatura do usuário.");

        let valorFinal = Number(plano.valor);

        // Define which base/promo values to look at based on the requested plan
        const isAnual = planIdentificador === SubscriptionIdentifer.YEARLY;
        const subValorBase = isAnual ? sub.valor_base_anual : sub.valor_base_mensal;
        const subValorPromo = isAnual ? sub.valor_promocional_anual : sub.valor_promocional_mensal;

        if (subValorBase !== null && subValorBase !== undefined) {
            valorFinal = Number(subValorBase);
        }

        const isPromotionActive = await getConfig(ConfigKey.SAAS_PROMOCAO_ATIVA, "false") === "true";

        if (isPromotionActive && plano.valor_promocional) {
            valorFinal = Number(plano.valor_promocional);
        }

        if (subValorPromo !== null && subValorPromo !== undefined) {
            if (!sub.data_fim_promocao) {
                // Definitivo
                valorFinal = Number(subValorPromo);
            } else {
                const fim = new Date(sub.data_fim_promocao).getTime();
                const agora = getNowBR().getTime();
                if (fim >= agora) {
                    valorFinal = Number(subValorPromo);
                }
            }
        }

        const { data: indicacao } = await referralRepository.getPendingReferralByIndicadoId(userId);

        if (indicacao) {
            const descontoPct = await getConfigNumber(ConfigKey.SAAS_REFERRAL_DISCOUNT_PCT, 10);
            if (descontoPct > 0) {
                valorFinal = valorFinal * (1 - descontoPct / 100);
            }
        }

        return Number(valorFinal.toFixed(2));
    },

    async getInvoices(userId: string) {
        const { data: invoices, error } = await invoiceRepository.getInvoicesByUserId(userId);
        if (error) throw error;
        return invoices;
    },

    async listPaymentMethods(userId: string) {
        const { data: methods, error } = await paymentMethodRepository.getByUserId(userId);
        if (error) throw error;
        return methods || [];
    },

    async deletePaymentMethod(userId: string, paymentMethodId: string) {
        const { error } = await paymentMethodRepository.deleteMethod(userId, paymentMethodId);
        if (error) throw error;

        await subscriptionRepository.updatePreferredMethodToNull(userId, paymentMethodId);
        return true;
    },

    async updateDefaultPaymentMethod(userId: string, paymentMethodId: string): Promise<void> {
        await paymentMethodRepository.clearDefaults(userId);
        const { error: updateError } = await paymentMethodRepository.setDefault(userId, paymentMethodId);
        if (updateError) throw updateError;

        const { error: subError } = await subscriptionRepository.updatePaymentMethod(userId, paymentMethodId, CheckoutPaymentMethod.CREDIT_CARD);
        if (subError) throw subError;
    },

    async createInvoice(userId: string, requestData: CreateInvoiceDTO) {
        const {
            planId, paymentMethod, installments, paymentToken, savedCardId, saveCard, cardBrand, cardLast4, expireMonth, expireYear,
            birth, street, number, neighborhood, zipcode, city, state
        } = requestData;

        const [userRes, planRes] = await Promise.all([
            userRepository.getById(userId),
            planRepository.getById(planId)
        ]);

        if (userRes.error || !userRes.data) throw new Error("Usuário não encontrado.");
        if (planRes.error || !planRes.data) throw new Error("Plano não encontrado.");

        const user = userRes.data;
        const plano = planRes.data;
        const valor = await this.calculatePrice(userId, plano.identificador);

        const sub = await subscriptionService.getOrCreateSubscription(userId);
        if (!sub) throw new Error("Erro ao obter assinatura.");

        let currentPaymentToken = paymentToken;
        let preferredMethodId: string | null = sub.metodo_pagamento_preferencial_id;

        if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD) {
            const cardIdToUse = savedCardId || preferredMethodId;

            if (!currentPaymentToken && cardIdToUse) {
                const { data: savedCard } = await paymentMethodRepository.getSavedCard(userId, cardIdToUse);
                if (savedCard) {
                    currentPaymentToken = savedCard.payment_token;
                    preferredMethodId = savedCard.id;
                }
            }

            if (!currentPaymentToken) {
                throw new Error("Token de pagamento não fornecido ou método salvo não encontrado.");
            }

            if (preferredMethodId) {
                await subscriptionRepository.updatePaymentMethod(userId, preferredMethodId, CheckoutPaymentMethod.CREDIT_CARD);
            }
        } else {
            await subscriptionRepository.updatePaymentMethod(userId, "", CheckoutPaymentMethod.PIX);
        }

        const invoiceDays = await getConfigNumber(ConfigKey.SAAS_DIAS_VENCIMENTO, 30);
        const dataVencimentoFatura = toPersistenceString(addDays(new Date(getNowBR().getTime()), invoiceDays));

        const { paymentService } = await import("../payments/payment.service.js");

        let chargeRes;
        try {
            chargeRes = await paymentService.createCharge({
                amount: valor,
                description: `Assinatura Van360 - Plano ${plano.nome}`,
                dueDate: dataVencimentoFatura,
                externalId: `sub_${sub.id}_${Date.now()}`,
                paymentMethod: paymentMethod,
                installments: installments,
                paymentToken: currentPaymentToken,
                customer: {
                    name: user.nome,
                    document: user.cpfcnpj,
                    email: user.email,
                    phone: user.telefone || "11999999999",
                    birth: birth || "1980-01-01"
                },
                billingAddress: (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD && street) ? {
                    street: street,
                    number: number!,
                    neighborhood: neighborhood!,
                    zipcode: zipcode?.replace(/\D/g, "")!,
                    city: city!,
                    state: state!
                } : undefined
            }, PaymentProvider.EFIPAY);
        } catch (gatewayErr) {
            const errMsg = extractErrorMessage(gatewayErr, "Erro de conexão com gateway de pagamento.");

            logger.error({ userId, error: errMsg }, "[SubscriptionBillingService] Erro de conexão/exceção no Gateway");

            try {
                const { data: failedInvoice } = await invoiceRepository.createInvoice({
                    usuario_id: userId,
                    assinatura_id: sub.id,
                    plano_id: planId,
                    metodo_pagamento: paymentMethod,
                    valor,
                    status: SubscriptionInvoiceStatus.FAILED,
                    data_vencimento: dataVencimentoFatura,
                    gateway_txid: undefined,
                    pix_copy_paste: undefined
                });

                if (failedInvoice) {
                    try {
                        await historicoService.log({
                            usuario_id: userId,
                            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
                            entidade_id: failedInvoice.id,
                            acao: AtividadeAcao.SAAS_FATURA_RECUSADA,
                            descricao: `Tentativa de pagamento recusada/falha de conexão: ${errMsg}`
                        });
                        await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString(), failedInvoice.id);
                    } catch (cleanupErr) {
                        logger.error({ cleanupErr, userId }, "[SubscriptionBillingService] Falha ao limpar faturas pendentes/recusadas anteriores.");
                    }
                }

                if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD) {
                    const { notificationService } = await import("../notifications/notification.service.js");
                    const { EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO } = await import("../../config/constants.js");
                    notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
                        nomeMotorista: user.nome,
                        telefone: user.telefone,
                        usuarioId: userId,
                        erro: errMsg,
                        planoNome: plano.nome,
                        origem: "MANUAL"
                    }, {
                        channels: ['TELEGRAM'],
                        jobId: `admin-falha-pagamento-${userId}-manual-${Date.now()}`
                    }).catch(err => logger.error({ err }, "[SubscriptionBillingService] Falha ao notificar admin sobre recusa manual de cartão"));
                }
            } catch (dbError) {
                logger.error({ userId, dbError }, "[SubscriptionBillingService] Erro ao gravar fatura falha no banco.");
            }

            throw gatewayErr instanceof Error ? gatewayErr : new Error(errMsg);
        }

        if (!chargeRes.success) {
            const errorString = extractErrorMessage(chargeRes.error, "Cartão recusado");

            logger.error({ userId, error: errorString }, "[SubscriptionBillingService] Erro ao gerar Cobrança no Gateway");

            try {
                const { data: failedInvoice } = await invoiceRepository.createInvoice({
                    usuario_id: userId,
                    assinatura_id: sub.id,
                    plano_id: planId,
                    metodo_pagamento: paymentMethod,
                    valor,
                    status: SubscriptionInvoiceStatus.FAILED,
                    data_vencimento: dataVencimentoFatura,
                    gateway_txid: chargeRes.providerId || undefined,
                    pix_copy_paste: undefined
                });

                if (failedInvoice) {
                    try {
                        await historicoService.log({
                            usuario_id: userId,
                            entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
                            entidade_id: failedInvoice.id,
                            acao: AtividadeAcao.SAAS_FATURA_RECUSADA,
                            descricao: `Tentativa de pagamento recusada: ${errorString}`
                        });
                        await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString(), failedInvoice.id);
                    } catch (cleanupErr) {
                        logger.error({ cleanupErr, userId }, "[SubscriptionBillingService] Falha ao limpar faturas pendentes/recusadas anteriores.");
                    }
                }

                if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD) {
                    const { notificationService } = await import("../notifications/notification.service.js");
                    const { EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO } = await import("../../config/constants.js");
                    notificationService.notifyAdmin(EVENTO_ADMIN_ASSINATURA_FALHA_PAGAMENTO, {
                        nomeMotorista: user.nome,
                        telefone: user.telefone,
                        usuarioId: userId,
                        erro: errorString,
                        planoNome: plano.nome,
                        origem: "MANUAL"
                    }, {
                        channels: ['TELEGRAM'],
                        jobId: `admin-falha-pagamento-${userId}-manual-${Date.now()}`
                    }).catch(err => logger.error({ err }, "[SubscriptionBillingService] Falha ao notificar admin sobre recusa manual de cartão"));
                }
            } catch (dbError) {
                logger.error({ userId, dbError }, "[SubscriptionBillingService] Erro ao gravar fatura falha no banco.");
            }

            const userFacingMessage = chargeRes.isUserFacing
                ? errorString
                : "Não foi possível processar o pagamento com cartão no momento. Por favor, tente novamente ou entre em contato com o suporte.";

            throw new Error(userFacingMessage);
        }

        if (paymentMethod === CheckoutPaymentMethod.CREDIT_CARD && currentPaymentToken && saveCard && cardLast4 && cardBrand) {
            const { data: existingCard } = await paymentMethodRepository.findMatchingCard(
                userId, cardBrand, cardLast4, expireMonth ?? "", expireYear ?? ""
            );

            await paymentMethodRepository.clearDefaults(userId);

            if (existingCard) {
                await paymentMethodRepository.updateTokenAndDefault(existingCard.id, currentPaymentToken);
                preferredMethodId = existingCard.id;
            } else {
                const { data: newMethod } = await paymentMethodRepository.createMethod({
                    usuario_id: userId,
                    brand: cardBrand,
                    last_4_digits: cardLast4,
                    expire_month: expireMonth ?? "",
                    expire_year: expireYear ?? "",
                    payment_token: currentPaymentToken,
                    is_default: true
                });
                if (newMethod) preferredMethodId = newMethod.id;
            }

            if (preferredMethodId) {
                await subscriptionRepository.updatePreferredMethod(sub.id, preferredMethodId);
            }

            if (street) {
                try {
                    await userRepository.update(userId, {
                        logradouro: street,
                        numero: number,
                        bairro: neighborhood,
                        cidade: city,
                        estado: state,
                        cep: zipcode?.replace(/\D/g, "")
                    });
                } catch (updateErr) {
                    logger.error({ userId, updateErr }, "[SubscriptionBillingService] Erro ao salvar endereco do usuario.");
                }
            }
        }

        const numParcelas = installments || 1;
        const { data: fatura, error: fError } = await invoiceRepository.createInvoice({
            usuario_id: userId,
            assinatura_id: sub.id,
            plano_id: planId,
            metodo_pagamento: paymentMethod,
            valor,
            status: SubscriptionInvoiceStatus.PENDING,
            data_vencimento: dataVencimentoFatura,
            gateway_txid: chargeRes.providerId,
            pix_copy_paste: chargeRes.pixCopyPaste,
            parcelas: numParcelas,
            valor_parcela: Number((valor / numParcelas).toFixed(2)),
            valor_total: valor
        });

        if (fError || !fatura) throw fError || new Error("Erro ao criar fatura");

        try {
            await historicoService.log({
                usuario_id: userId,
                entidade_tipo: AtividadeEntidadeTipo.SAAS_FATURA,
                entidade_id: fatura.id,
                acao: AtividadeAcao.SAAS_FATURA_GERADA,
                descricao: `Cobrança gerada (${paymentMethod === CheckoutPaymentMethod.PIX ? 'Pix' : 'Cartão de Crédito'}). Valor: R$ ${valor.toFixed(2).replace('.', ',')}`
            });
            await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, getNowBR().toISOString(), fatura.id);
        } catch (err: unknown) {
            logger.error({ err, userId }, "[SubscriptionBillingService] Falha ao cancelar faturas pendentes/recusadas anteriores.");
        }

        return fatura;
    }
};
