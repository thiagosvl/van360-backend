import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { userRepository } from "../../repositories/user.repository.js";
import { CheckoutPaymentMethod, MetaEventName } from "../../types/enums.js";
import { metaCapiClient } from "./meta-capi.client.js";
import { buildMetaUserData, MetaRequestContext, MetaUserSource } from "./meta-user-data.builder.js";

const DEFAULT_APP_URL = "https://app.van360.com.br";
const DEFAULT_CURRENCY = "BRL";
const SIGNUP_CONTENT_NAME = "Teste grátis Van360";
const SUBSCRIPTION_CONTENT_NAME = "Assinatura Van360";
const SUBSCRIPTION_CONTENT_CATEGORY = "assinatura";

export interface SubscriptionPaymentEvent {
  userId: string;
  isNewCustomer: boolean | null;
  value: number;
  currency?: string;
  planName?: string;
  paymentMethod?: CheckoutPaymentMethod | null;
}

// Mesmo id que o pixel do navegador usa no Lead, para a Meta deduplicar os dois envios.
export const metaEventIds = {
  lead: (userId: string) => `lead_${userId}`,
  firstPurchase: (userId: string) => `purchase_${userId}`,
};

function appUrl(): string {
  return env.FRONTEND_URL || DEFAULT_APP_URL;
}

export const metaConversionsService = {
  async trackSignup(user: MetaUserSource, context: MetaRequestContext = {}): Promise<void> {
    try {
      await metaCapiClient.send({
        eventName: MetaEventName.LEAD,
        eventId: metaEventIds.lead(user.id),
        eventSourceUrl: appUrl(),
        userData: buildMetaUserData(user, context),
        customData: { content_name: SIGNUP_CONTENT_NAME },
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), userId: user.id }, "[MetaConversions] Falha ao enviar Lead");
    }
  },

  async trackSubscriptionPayment(event: SubscriptionPaymentEvent): Promise<void> {
    if (event.isNewCustomer !== true) {
      logger.info({ userId: event.userId, paymentMethod: event.paymentMethod, isNewCustomer: event.isNewCustomer }, "[MetaConversions] Pagamento não é aquisição nova; Purchase não enviado");
      return;
    }

    try {
      const { data: user, error } = await userRepository.getById(event.userId);
      if (error || !user) {
        logger.warn({ userId: event.userId, error }, "[MetaConversions] Usuário não encontrado para Purchase");
        return;
      }

      await metaCapiClient.send({
        eventName: MetaEventName.PURCHASE,
        eventId: metaEventIds.firstPurchase(event.userId),
        eventSourceUrl: appUrl(),
        userData: buildMetaUserData(user),
        customData: {
          value: Number(event.value.toFixed(2)),
          currency: event.currency || DEFAULT_CURRENCY,
          content_name: event.planName || SUBSCRIPTION_CONTENT_NAME,
          content_category: SUBSCRIPTION_CONTENT_CATEGORY,
          payment_method: event.paymentMethod ?? undefined,
        },
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err), userId: event.userId }, "[MetaConversions] Falha ao enviar Purchase");
    }
  },
};
