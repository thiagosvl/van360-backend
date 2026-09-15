import crypto from "crypto";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

interface UserDataParams {
  email?: string;
  phone?: string;
  clientIp?: string;
  clientUserAgent?: string;
  fbp?: string;
  fbc?: string;
}

interface CustomDataParams {
  currency?: string;
  value?: number;
  contentName?: string;
  status?: string;
  [key: string]: string | number | boolean | undefined;
}

interface MetaCapiEventInput {
  eventName: "Lead" | "StartTrial" | "Purchase" | "CompleteRegistration" | "PageView";
  eventId?: string;
  eventSourceUrl?: string;
  userData: UserDataParams;
  customData?: CustomDataParams;
}

export class MetaCapiService {
  private static hashSha256(value: string): string {
    return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
  }

  private static formatPhone(phone: string): string {
    const digitsOnly = phone.replace(/\D/g, "");
    if (!digitsOnly) return "";
    return digitsOnly.startsWith("55") ? digitsOnly : `55${digitsOnly}`;
  }

  public static async sendEvent(input: MetaCapiEventInput): Promise<boolean> {
    const { META_PIXEL_ID, META_CAPI_ACCESS_TOKEN, META_TEST_EVENT_CODE } = env;

    if (!META_PIXEL_ID || !META_CAPI_ACCESS_TOKEN) {
      logger.warn("Meta CAPI não configurado: PIXEL_ID ou ACCESS_TOKEN ausentes");
      return false;
    }

    try {
      const userDataPayload: Record<string, unknown> = {};

      if (input.userData.email) {
        userDataPayload.em = [this.hashSha256(input.userData.email)];
      }

      if (input.userData.phone) {
        const formattedPhone = this.formatPhone(input.userData.phone);
        if (formattedPhone) {
          userDataPayload.ph = [this.hashSha256(formattedPhone)];
        }
      }

      if (input.userData.clientIp) {
        userDataPayload.client_ip_address = input.userData.clientIp;
      }

      if (input.userData.clientUserAgent) {
        userDataPayload.client_user_agent = input.userData.clientUserAgent;
      }

      if (input.userData.fbp) {
        userDataPayload.fbp = input.userData.fbp;
      }

      if (input.userData.fbc) {
        userDataPayload.fbc = input.userData.fbc;
      }

      const eventPayload: Record<string, unknown> = {
        event_name: input.eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: userDataPayload,
      };

      if (input.eventId) {
        eventPayload.event_id = input.eventId;
      }

      if (input.eventSourceUrl) {
        eventPayload.event_source_url = input.eventSourceUrl;
      }

      if (input.customData) {
        eventPayload.custom_data = input.customData;
      }

      const body: Record<string, unknown> = {
        data: [eventPayload],
      };

      if (META_TEST_EVENT_CODE) {
        body.test_event_code = META_TEST_EVENT_CODE;
      }

      const url = `https://graph.facebook.com/v21.0/${META_PIXEL_ID}/events?access_token=${META_CAPI_ACCESS_TOKEN}`;

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const responseData = await response.json();

      if (!response.ok) {
        logger.error({ responseData }, "Erro ao enviar evento CAPI para a Meta");
        return false;
      }

      logger.info({ eventName: input.eventName, eventId: input.eventId }, "Evento CAPI enviado à Meta com sucesso");
      return true;
    } catch (error) {
      logger.error({ error }, "Exceção ao disparar evento CAPI para a Meta");
      return false;
    }
  }

  public static async sendRegistrationLead(data: {
    userId: string;
    email: string;
    phone?: string;
    clientIp?: string;
    clientUserAgent?: string;
    fbp?: string;
    fbc?: string;
    sourceUrl?: string;
  }): Promise<void> {
    await this.sendEvent({
      eventName: "Lead",
      eventId: `lead_${data.userId}`,
      eventSourceUrl: data.sourceUrl || "https://van360.com.br",
      userData: {
        email: data.email,
        phone: data.phone,
        clientIp: data.clientIp,
        clientUserAgent: data.clientUserAgent,
        fbp: data.fbp,
        fbc: data.fbc,
      },
      customData: {
        status: "trial_15_days",
      },
    });
  }

  public static async sendPurchaseEvent(data: {
    userId: string;
    email: string;
    phone?: string;
    value: number;
    currency?: string;
    planName?: string;
    transactionId?: string;
  }): Promise<void> {
    await this.sendEvent({
      eventName: "Purchase",
      eventId: data.transactionId || `purchase_${data.userId}_${Date.now()}`,
      eventSourceUrl: "https://app.van360.com.br",
      userData: {
        email: data.email,
        phone: data.phone,
      },
      customData: {
        value: data.value,
        currency: data.currency || "BRL",
        contentName: data.planName || "Assinatura Van360",
      },
    });
  }
}
