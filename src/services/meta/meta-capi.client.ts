import crypto from "crypto";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { MetaActionSource, MetaEventName } from "../../types/enums.js";

const GRAPH_API_VERSION = "v21.0";
const MAX_ATTEMPTS = 2;

export interface MetaUserData {
  email?: string | null;
  phone?: string | null;
  externalId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  dateOfBirth?: string | null;
  clientIp?: string | null;
  clientUserAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
}

export interface MetaCustomData {
  currency?: string;
  value?: number;
  content_name?: string;
  content_category?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface MetaServerEvent {
  eventName: MetaEventName;
  eventId: string;
  eventTime?: Date;
  eventSourceUrl?: string;
  actionSource?: MetaActionSource;
  userData: MetaUserData;
  customData?: MetaCustomData;
}

const HASHED_USER_FIELDS: Array<[keyof MetaUserData, string]> = [
  ["email", "em"],
  ["phone", "ph"],
  ["externalId", "external_id"],
  ["firstName", "fn"],
  ["lastName", "ln"],
  ["city", "ct"],
  ["state", "st"],
  ["zip", "zp"],
  ["country", "country"],
  ["dateOfBirth", "db"],
];

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function buildUserDataPayload(userData: MetaUserData): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const [field, key] of HASHED_USER_FIELDS) {
    const value = userData[field];
    if (value) payload[key] = [sha256(value)];
  }

  if (userData.clientIp) payload.client_ip_address = userData.clientIp;
  if (userData.clientUserAgent) payload.client_user_agent = userData.clientUserAgent;
  if (userData.fbp) payload.fbp = userData.fbp;
  if (userData.fbc) payload.fbc = userData.fbc;

  return payload;
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

export const metaCapiClient = {
  isConfigured(): boolean {
    return Boolean(env.META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN);
  },

  async send(event: MetaServerEvent): Promise<boolean> {
    if (!this.isConfigured()) {
      logger.warn({ eventName: event.eventName }, "[MetaCapi] Não configurado: META_PIXEL_ID ou META_CAPI_ACCESS_TOKEN ausentes");
      return false;
    }

    const eventPayload: Record<string, unknown> = {
      event_name: event.eventName,
      event_time: Math.floor((event.eventTime ?? new Date()).getTime() / 1000),
      event_id: event.eventId,
      action_source: event.actionSource ?? MetaActionSource.WEBSITE,
      user_data: buildUserDataPayload(event.userData),
    };
    if (event.eventSourceUrl) eventPayload.event_source_url = event.eventSourceUrl;
    if (event.customData) eventPayload.custom_data = event.customData;

    const body: Record<string, unknown> = { data: [eventPayload] };
    if (env.META_TEST_EVENT_CODE) body.test_event_code = env.META_TEST_EVENT_CODE;

    const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${env.META_PIXEL_ID}/events?access_token=${env.META_CAPI_ACCESS_TOKEN}`;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const responseData = await response.json().catch(() => null);

        if (response.ok) {
          logger.info({ eventName: event.eventName, eventId: event.eventId }, "[MetaCapi] Evento enviado");
          return true;
        }

        logger.error({ eventName: event.eventName, eventId: event.eventId, status: response.status, responseData, attempt }, "[MetaCapi] Meta recusou o evento");
        if (!isRetryableStatus(response.status)) return false;
      } catch (error) {
        logger.error({ eventName: event.eventName, eventId: event.eventId, error: error instanceof Error ? error.message : String(error), attempt }, "[MetaCapi] Falha de rede ao enviar evento");
      }
    }
    return false;
  },
};
