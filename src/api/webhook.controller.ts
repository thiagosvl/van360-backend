import { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { PaymentProvider, SubscriptionInvoiceStatus } from "../types/enums.js";
import { paymentService } from "../services/payments/payment.service.js";
import { supabaseAdmin } from "../config/supabase.js";
import { subscriptionService } from "../services/subscriptions/subscription.service.js";

export const WebhookController = {

  async handleEfipay(request: FastifyRequest, reply: FastifyReply) {
    const { token } = request.query as Record<string, string>;
    if (env.EFI_WEBHOOK_TOKEN && token !== env.EFI_WEBHOOK_TOKEN) {
      logger.warn({ ip: request.ip }, "[WebhookController] Webhook Efí rejeitado: token inválido");
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
      const { data: fatura, error } = await supabaseAdmin
        .from("assinatura_faturas")
        .select("id, status, usuario_id")
        .eq("gateway_txid", txid)
        .maybeSingle();

      if (error) throw error;

      if (fatura) {
        if (event.type === "PAYMENT_RECEIVED") {
          if (fatura.status === SubscriptionInvoiceStatus.PAID) {
            return reply.code(200).send({ message: "Já processado" });
          }
          logger.info({ faturaId: fatura.id, txid }, "[WebhookController] Confirmando pagamento de assinatura SaaS");
          await subscriptionService.activateByFatura(fatura.id);
        } else if (event.type === "PAYMENT_FAILED") {
          logger.warn({ faturaId: fatura.id, txid }, "[WebhookController] Falha no pagamento (Cartão). Marcando como FAILED.");
          await supabaseAdmin
            .from("assinatura_faturas")
            .update({ status: SubscriptionInvoiceStatus.FAILED })
            .eq("id", fatura.id);
        }
        return reply.code(200).send({ success: true });
      }

      logger.warn({ txid, type: event.type }, "[WebhookController] Evento recebido mas não mapeado localmente.");
      return reply.code(200).send({ received: true, mapped: false });

    } catch (err: any) {
      logger.error({ error: err.message, txid }, "[WebhookController] Erro ao processar webhook");
      return reply.code(500).send({ error: "Internal Server Error" });
    }
  },

};
