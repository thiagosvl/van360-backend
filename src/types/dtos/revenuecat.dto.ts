export enum RevenueCatEventType {
  INITIAL_PURCHASE = "INITIAL_PURCHASE",
  NON_RENEWING_PURCHASE = "NON_RENEWING_PURCHASE",
  RENEWAL = "RENEWAL",
  PRODUCT_CHANGE = "PRODUCT_CHANGE",
  CANCELLATION = "CANCELLATION",
  UNCANCELLATION = "UNCANCELLATION",
  BILLING_ISSUE = "BILLING_ISSUE",
  SUBSCRIBER_ALIAS = "SUBSCRIBER_ALIAS",
  SUBSCRIPTION_PAUSED = "SUBSCRIPTION_PAUSED",
  EXPIRATION = "EXPIRATION",
  REVOCATION = "REVOCATION",
  TEST = "TEST",
}

export const IAP_PRODUCTS = {
  MENSAL_110: "van360_mensal_110",
  ANUAL_110: "van360_anual_110",
  MENSAL_250: "van360_mensal_250_alunos",
  ANUAL_250: "van360_anual_250",
} as const;

export interface RevenueCatWebhookEvent {
  id: string;
  type: RevenueCatEventType | string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id: string;
  price?: number;
  price_in_purchased_currency?: number;
  currency?: string;
  store?: string;
  environment?: "SANDBOX" | "PRODUCTION";
  purchased_at_ms?: number;
  expiration_at_ms?: number | null;
  original_transaction_id?: string;
  transaction_id?: string;
  cancel_reason?: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[];
}

export interface RevenueCatWebhookPayload {
  api_version: string;
  event: RevenueCatWebhookEvent;
}
