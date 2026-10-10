import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import {
  PaymentProvider,
  SubscriptionInvoiceStatus,
  SubscriptionStatus,
  NormalizedPaymentEventType,
  CobrancaStatus,
  StatusRepasseEnum,
  ProvedorPagamentoEnum
} from "../types/enums.js";
import { paymentService } from "../services/payments/payment.service.js";
import { cobrancaCalculoService } from "../services/cobranca-calculo.service.js";
import { cobrancaPagamentoService } from "../services/cobranca-pagamento.service.js";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { subscriptionRepository } from "../repositories/subscription.repository.js";
import { cobrancaRepository } from "../repositories/cobranca.repository.js";
import { cobrancaRepasseRepository } from "../repositories/cobranca-repasse.repository.js";
import { motoristaFinanceiroRepository } from "../repositories/motorista-financeiro.repository.js";
import { addToRepasseQueue } from "../queues/repasse.queue.js";
import { getClientIp } from "../utils/request-client.utils.js";
import { withRetry } from "../utils/retry.utils.js";
import { errorAlertService } from "../services/error-alert.service.js";
import { subscriptionRevenueCatService } from "../services/subscriptions/subscription-revenuecat.service.js";
import { RevenueCatWebhookPayload } from "../types/dtos/revenuecat.dto.js";

export const WebhookController = {

  async handleEfipay(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.query as Record<string, string>;
    if (env.EFI_WEBHOOK_TOKEN && token !== env.EFI_WEBHOOK_TOKEN) {
      logger.warn({ ip: getClientIp(request) }, "[WebhookController] Webhook Efí rejeitado: token inválido");
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const rawBody = request.body as Record<string, unknown>;
    logger.info({ body: rawBody }, "[WebhookController] Recebido webhook da Efí Pay");

    const event = await paymentService.processWebhook(PaymentProvider.EFIPAY, rawBody);

    if (!event) {
      return reply.code(200).send({ received: true, status: "ignored" });
    }

    const txid = event.internalId;

    try {
      const { data: fatura, error } = await invoiceRepository.getInvoiceByGatewayTxId(txid);

      if (error) throw error;

      if (fatura) {
        if (event.type === NormalizedPaymentEventType.PAYMENT_RECEIVED) {
          if (fatura.status === SubscriptionInvoiceStatus.PAID) {
            return reply.code(200).send({ message: "Já processado" });
          }
          logger.info({ faturaId: fatura.id, txid }, "[WebhookController] Confirmando pagamento de assinatura SaaS");

          await withRetry(
            async () => {
              await subscriptionService.activateByFatura(fatura.id);
            },
            {
              maxRetries: 3,
              initialDelayMs: 1000,
              backoffFactor: 1.5,
              onRetry: (retryErr, attempt, nextDelay) => {
                logger.warn(
                  { faturaId: fatura.id, txid, attempt, nextDelay, error: retryErr instanceof Error ? retryErr.message : String(retryErr) },
                  "[WebhookController] Retentando confirmação de fatura SaaS..."
                );
              },
            }
          );
        } else if (event.type === NormalizedPaymentEventType.PAYMENT_FAILED) {
          logger.warn({ faturaId: fatura.id, txid }, "[WebhookController] Falha no pagamento (Cartão). Marcando como FAILED.");
          await invoiceRepository.updateInvoiceStatus(fatura.id, SubscriptionInvoiceStatus.FAILED);
        } else if (event.type === NormalizedPaymentEventType.PAYMENT_REFUNDED) {
          logger.error({ faturaId: fatura.id, txid }, "[WebhookController] Pagamento estornado/contestado. Cancelando assinatura.");
          
          await invoiceRepository.updateInvoiceStatus(fatura.id, SubscriptionInvoiceStatus.CANCELED);

          if (fatura.assinatura_id) {
            await subscriptionRepository.updateStatus(fatura.assinatura_id, SubscriptionStatus.EXPIRED);
          }
        }
        return reply.code(200).send({ success: true });
      }

      logger.warn({ txid, type: event.type }, "[WebhookController] Evento recebido mas não mapeado localmente.");
      return reply.code(200).send({ received: true, mapped: false });

    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errorMsg, txid }, "[WebhookController] Erro ao processar webhook");

      void errorAlertService.notifyPaymentError({
        provider: PaymentProvider.EFIPAY,
        error: err,
        externalId: txid,
        paymentMethod: "pix",
        details: {
          txid,
          eventType: event?.type,
        },
      });

      return reply.code(500).send({ error: "Internal Server Error" });
    }
  },

  async handleWoovi(request: FastifyRequest, reply: FastifyReply) {
    const rawBody = request.body as Record<string, unknown>;
    logger.info({ body: rawBody }, "[WebhookController] Recebido webhook da Woovi");

    const event = await paymentService.processWebhook(PaymentProvider.WOOVI, rawBody);
    if (!event) {
      return reply.code(200).send({ received: true, status: "ignored" });
    }

    const cobrancaId = event.internalId;
    if (!cobrancaId) {
      logger.warn({ rawBody }, "[WebhookController] Webhook recebido sem internalId (correlationID)");
      return reply.code(200).send({ received: true, status: "no_internal_id" });
    }

    try {
      const { data: cobranca, error: findError } = await cobrancaRepository.getById(cobrancaId);
      if (findError || !cobranca) {
        logger.warn({ cobrancaId }, "[WebhookController] Cobrança não encontrada para o webhook recebido");
        return reply.code(200).send({ received: true, status: "cobranca_not_found" });
      }

      if (cobranca.status === CobrancaStatus.PAGO) {
        return reply.code(200).send({ received: true, status: "already_paid" });
      }

      if (event.type === NormalizedPaymentEventType.PAYMENT_RECEIVED) {
        const motoristaId = cobranca.usuario_id || "";

        await cobrancaRepository.update(cobranca.id, {
          repasse_em_processamento: true
        });

        const motoristaConfig = await motoristaFinanceiroRepository.getByUsuarioId(motoristaId);
        const chavePixRepasse = motoristaConfig.chave_pix_repasse;

        if (!chavePixRepasse) {
          logger.error({ cobrancaId, motoristaId }, "[WebhookController] Motorista não possui chave Pix para repasse");
          return reply.code(200).send({ received: true, status: "missing_pix_key" });
        }

        const taxaPlataforma = cobrancaCalculoService.resolverTaxaPlataforma(
          cobranca.valor_taxa_plataforma !== null && cobranca.valor_taxa_plataforma !== undefined
            ? Number(cobranca.valor_taxa_plataforma)
            : motoristaConfig.taxa_personalizada
        );
        const valorRealPago = event.amount && event.amount > 0 ? event.amount : Number(cobranca.valor);
        const divisao = cobrancaCalculoService.calcularDivisaoCobranca({
          valorMensalidade: valorRealPago,
          taxaPlataforma
        });
        const valorLiquido = divisao.valorLiquidoMotorista;

        let repasse = await cobrancaRepasseRepository.getByTransacaoProvedorId(event.providerRef);
        if (!repasse) {
          const rawCharge = rawBody.charge as Record<string, unknown> | undefined;
          repasse = await cobrancaRepasseRepository.create({
            cobranca_id: cobranca.id,
            motorista_id: motoristaId,
            passageiro_id: cobranca.passageiro_id,
            provedor: ProvedorPagamentoEnum.WOOVI,
            valor_bruto: valorRealPago,
            taxa_plataforma: divisao.taxaPlataforma,
            tarifa_gateway_pix_in: divisao.tarifaGatewayPixIn,
            tarifa_gateway_saque: divisao.tarifaGatewaySaque,
            valor_liquido_motorista: valorLiquido,
            transacao_provedor_id: event.providerRef,
            end_to_end_id_in: (rawCharge?.endToEndId as string) || null,
            status_repasse: StatusRepasseEnum.PENDENTE,
            data_pagamento_pai: event.paidAt ? event.paidAt.toISOString() : new Date().toISOString()
          });
        }

        await addToRepasseQueue({
          repasseId: repasse.id,
          cobrancaId: cobranca.id,
          motoristaId,
          chavePix: chavePixRepasse,
          valorLiquido,
          transacaoProvedorId: event.providerRef
        });

        return reply.code(200).send({ received: true, status: "queued_for_payout" });
      }

      return reply.code(200).send({ received: true, status: "unhandled_event" });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errorMsg, cobrancaId }, "[WebhookController] Erro ao processar webhook Woovi");

      void errorAlertService.notifyPaymentError({
        provider: PaymentProvider.WOOVI,
        error: err,
        externalId: cobrancaId,
        paymentMethod: "pix",
        details: {
          cobrancaId,
          eventType: event?.type,
        },
      });

      return reply.code(500).send({ error: "Internal Server Error" });
    }
  },

  async handleRevenueCat(request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;
    if (env.REVENUECAT_WEBHOOK_SECRET && authHeader !== `Bearer ${env.REVENUECAT_WEBHOOK_SECRET}`) {
      logger.warn({ ip: getClientIp(request) }, "[WebhookController] Webhook RevenueCat rejeitado: token inválido");
      return reply.code(401).send({ error: "Unauthorized" });
    }

    const payload = request.body as RevenueCatWebhookPayload;
    try {
      const result = await subscriptionRevenueCatService.processWebhook(payload);
      return reply.code(200).send({ received: true, ...result });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error({ error: errorMsg }, "[WebhookController] Erro ao processar webhook RevenueCat");
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  },
};

