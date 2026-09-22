import { CanalAquisicao, DispositivoCadastro } from "../types/enums.js";

export type CategoriaOrigemAquisicao =
  | "meta_ads"
  | "google_ads"
  | "tiktok_ads"
  | "play_store"
  | "site_organico"
  | "indicacao"
  | "direto";

export interface ResolvedLeadAttribution {
  origem: string;
  categoria: CategoriaOrigemAquisicao;
}

export function resolveLeadAttribution(
  rawMetadados?: Record<string, unknown> | null,
  dispositivo?: string | null,
  canalAuto?: string | null
): ResolvedLeadAttribution {
  const utm = (rawMetadados?.utm as Record<string, string | undefined> | null) || undefined;
  const referrer = typeof rawMetadados?.referrer === "string" ? rawMetadados.referrer : undefined;

  const isInternalReferrer = Boolean(
    referrer && (
      referrer.includes("app.van360.com.br") ||
      referrer.includes("capacitor://") ||
      referrer.includes("localhost")
    )
  );
  const cleanReferrer = isInternalReferrer ? undefined : referrer;

  const source = utm?.source?.toLowerCase();
  const fbclid = utm?.fbclid;
  const gclid = utm?.gclid;
  const gbraid = utm?.gbraid;
  const ttclid = utm?.ttclid;

  const hasUtmParams = Boolean(
    utm && Object.values(utm).some((val) => typeof val === "string" && val.trim().length > 0)
  );

  const dispUpper = dispositivo?.toUpperCase();

  if (source === "ig" || (source === "lp" && fbclid) || source === "instagram") {
    return { origem: "Instagram Ads (Meta)", categoria: "meta_ads" };
  }

  if (source === "fb" || source === "facebook" || fbclid) {
    return { origem: "Facebook Ads (Meta)", categoria: "meta_ads" };
  }

  if (source === "google" || gclid || gbraid) {
    return { origem: "Google Ads", categoria: "google_ads" };
  }

  if (source === "tiktok" || ttclid) {
    return { origem: "TikTok Ads", categoria: "tiktok_ads" };
  }

  if (dispUpper === DispositivoCadastro.APP_ANDROID && !hasUtmParams) {
    return { origem: "Play Store (App Android Nativo)", categoria: "play_store" };
  }

  if (dispUpper === DispositivoCadastro.APP_IOS && !hasUtmParams) {
    return { origem: "App Store (App iOS Nativo)", categoria: "play_store" };
  }

  if (canalAuto === CanalAquisicao.INDICACAO) {
    return { origem: "Indicação", categoria: "indicacao" };
  }

  if (source === "blog" || cleanReferrer?.includes("van360.com.br/blog")) {
    return { origem: "Blog Van360", categoria: "site_organico" };
  }

  if (source === "lp" || cleanReferrer?.includes("van360.com.br")) {
    return { origem: "Site Institucional", categoria: "site_organico" };
  }

  if (cleanReferrer?.includes("instagram.com")) {
    return { origem: "Instagram (Orgânico)", categoria: "site_organico" };
  }

  if (cleanReferrer?.includes("facebook.com")) {
    return { origem: "Facebook (Orgânico)", categoria: "site_organico" };
  }

  if (cleanReferrer?.includes("google.")) {
    return { origem: "Google (Busca Orgânica)", categoria: "site_organico" };
  }

  return { origem: "Acesso Direto / Orgânico", categoria: "direto" };
}
