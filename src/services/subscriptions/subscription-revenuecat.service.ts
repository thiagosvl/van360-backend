import { logger } from "../../config/logger.js";
import { supabaseAdmin } from "../../config/supabase.js";
import {
  SubscriptionStatus,
  SubscriptionIdentifer,
  AtividadeAcao,
  AtividadeEntidadeTipo,
  CheckoutPaymentMethod,
} from "../../types/enums.js";
import { historicoService } from "../historico.service.js";
import { planRepository } from "../../repositories/plan.repository.js";
import { invoiceRepository } from "../../repositories/invoice.repository.js";
import { subscriptionService } from "./subscription.service.js";
import {
  RevenueCatWebhookPayload,
  RevenueCatEventType,
  IAP_PRODUCTS,
} from "../../types/dtos/revenuecat.dto.js";

export const subscriptionRevenueCatService = {
  async processWebhook(payload: RevenueCatWebhookPayload): Promise<{ handled: boolean; message: string }> {
    const { event } = payload;
    if (!event) {
      return { handled: false, message: "Payload sem campo event" };
    }

    const {
      type,
      app_user_id: rawUserId,
      original_app_user_id: originalUserId,
      product_id: productId,
      expiration_at_ms: expirationAtMs,
      original_transaction_id: originalTxId,
      transaction_id: txId,
      environment,
    } = event;

    logger.info(
      { type, rawUserId, originalUserId, productId, environment, txId },
      "[RevenueCatService] Processando evento de webhook"
    );

    if (type === RevenueCatEventType.TEST) {
      logger.info("[RevenueCatService] Evento de teste recebido do RevenueCat com sucesso");
      return { handled: true, message: "Webhook de teste validado com sucesso" };
    }

    let userId = rawUserId;
    if (userId?.startsWith("$RCAnonymousID:") && originalUserId && !originalUserId.startsWith("$RCAnonymousID:")) {
      userId = originalUserId;
    }

    if (!userId || userId.startsWith("$RCAnonymousID:")) {
      logger.warn(
        { userId, type },
        "[RevenueCatService] Usuario anonimo ignorado no webhook"
      );
      return { handled: false, message: "Usuario anonimo" };
    }

    const sub = await subscriptionService.getOrCreateSubscription(userId);
    if (!sub) {
      logger.error(
        { userId },
        "[RevenueCatService] Nao foi possivel carregar ou criar assinatura para o usuario"
      );
      return { handled: false, message: "Assinatura nao encontrada" };
    }

    const isAnnual =
      productId === IAP_PRODUCTS.ANUAL_110 || productId === IAP_PRODUCTS.ANUAL_250;
    const planIdentifier = isAnnual ? SubscriptionIdentifer.YEARLY : SubscriptionIdentifer.MONTHLY;

    const { data: targetPlan } = await planRepository.getByIdentifier(planIdentifier);

    const expiryDate = expirationAtMs
      ? new Date(expirationAtMs).toISOString()
      : new Date(Date.now() + (isAnnual ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();

    switch (type) {
      case RevenueCatEventType.INITIAL_PURCHASE:
      case RevenueCatEventType.NON_RENEWING_PURCHASE:
      case RevenueCatEventType.PRODUCT_CHANGE: {
        const updatePayload: Record<string, unknown> = {
          status: SubscriptionStatus.ACTIVE,
          data_vencimento: expiryDate,
          metodo_pagamento: CheckoutPaymentMethod.APPLE_IAP,
          gateway_subscription_id: originalTxId || txId || sub.gateway_subscription_id,
          updated_at: new Date().toISOString(),
        };

        if (targetPlan?.id) {
          updatePayload.plano_id = targetPlan.id;
        }

        if (!sub.data_inicio) {
          updatePayload.data_inicio = new Date().toISOString();
        }

        const { error: updateError } = await supabaseAdmin
          .from("assinaturas")
          .update(updatePayload)
          .eq("id", sub.id);

        if (updateError) {
          logger.error({ updateError, subId: sub.id }, "[RevenueCatService] Erro ao ativar assinatura via Apple IAP");
          throw updateError;
        }

        await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, new Date().toISOString());

        await historicoService.log({
          usuario_id: userId,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
          descricao: `Assinatura ativada via Apple In-App Purchase (${productId}). Vencimento: ${expiryDate}.`,
        });

        logger.info({ userId, subId: sub.id, productId }, "[RevenueCatService] Assinatura Apple IAP ativada com sucesso");
        return { handled: true, message: "Assinatura ativada com sucesso" };
      }

      case RevenueCatEventType.RENEWAL: {
        const { error: renewError } = await supabaseAdmin
          .from("assinaturas")
          .update({
            status: SubscriptionStatus.ACTIVE,
            data_vencimento: expiryDate,
            metodo_pagamento: CheckoutPaymentMethod.APPLE_IAP,
            gateway_subscription_id: originalTxId || sub.gateway_subscription_id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        if (renewError) {
          logger.error({ renewError, subId: sub.id }, "[RevenueCatService] Erro ao renovar assinatura via Apple IAP");
          throw renewError;
        }

        await invoiceRepository.cancelIncompleteInvoicesByUserId(userId, new Date().toISOString());

        await historicoService.log({
          usuario_id: userId,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
          descricao: `Assinatura renovada pela Apple. Novo vencimento: ${expiryDate}.`,
        });

        logger.info({ userId, subId: sub.id, expiryDate }, "[RevenueCatService] Renovacao Apple IAP processada com sucesso");
        return { handled: true, message: "Renovacao processada com sucesso" };
      }

      case RevenueCatEventType.CANCELLATION: {
        logger.info(
          { userId, subId: sub.id, expiryDate },
          "[RevenueCatService] Auto-renovacao cancelada pelo usuario no iOS. Acesso ativo ate o fim do ciclo pago."
        );
        return { handled: true, message: "Cancelamento de auto-renovacao registrado" };
      }

      case RevenueCatEventType.UNCANCELLATION: {
        await supabaseAdmin
          .from("assinaturas")
          .update({
            status: SubscriptionStatus.ACTIVE,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        await historicoService.log({
          usuario_id: userId,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_ATIVA,
          descricao: "Auto-renovacao da assinatura reativada pelo usuario no iOS.",
        });

        logger.info({ userId, subId: sub.id }, "[RevenueCatService] Auto-renovacao reativada no iOS");
        return { handled: true, message: "Auto-renovacao reativada com sucesso" };
      }

      case RevenueCatEventType.EXPIRATION: {
        await supabaseAdmin
          .from("assinaturas")
          .update({
            status: SubscriptionStatus.EXPIRED,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        await historicoService.log({
          usuario_id: userId,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_EXPIRADA,
          descricao: "Assinatura da Apple expirada por termino de periodo.",
        });

        logger.info({ userId, subId: sub.id }, "[RevenueCatService] Assinatura marcada como expirada");
        return { handled: true, message: "Assinatura expirada" };
      }

      case RevenueCatEventType.REVOCATION: {
        await supabaseAdmin
          .from("assinaturas")
          .update({
            status: SubscriptionStatus.CANCELED,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        await historicoService.log({
          usuario_id: userId,
          entidade_tipo: AtividadeEntidadeTipo.SAAS_ASSINATURA,
          entidade_id: sub.id,
          acao: AtividadeAcao.SAAS_ASSINATURA_CANCELADA,
          descricao: "Assinatura revogada/reembolsada pela Apple.",
        });

        logger.info({ userId, subId: sub.id }, "[RevenueCatService] Assinatura revogada pela Apple");
        return { handled: true, message: "Assinatura revogada" };
      }

      case RevenueCatEventType.BILLING_ISSUE: {
        await supabaseAdmin
          .from("assinaturas")
          .update({
            status: SubscriptionStatus.PAST_DUE,
            updated_at: new Date().toISOString(),
          })
          .eq("id", sub.id);

        logger.warn({ userId, subId: sub.id }, "[RevenueCatService] Problema de cobranca na conta Apple do motorista");
        return { handled: true, message: "Problema de cobranca registrado" };
      }

      default:
        logger.info({ type }, "[RevenueCatService] Evento ignorado ou nao requer acao");
        return { handled: true, message: `Evento ${type} recebido` };
    }
  },
};
