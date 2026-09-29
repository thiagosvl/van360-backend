import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { PaymentProvider, SubscriptionInvoiceStatus, SubscriptionStatus, NormalizedPaymentEventType } from "../types/enums.js";
import { paymentService } from "../services/payments/payment.service.js";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";
import { invoiceRepository } from "../repositories/invoice.repository.js";
import { subscriptionRepository } from "../repositories/subscription.repository.js";
import { getClientIp } from "../utils/request-client.utils.js";
import { withRetry } from "../utils/retry.utils.js";
import { errorAlertService } from "../services/error-alert.service.js";

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

};
