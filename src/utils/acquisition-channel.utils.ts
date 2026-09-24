import { CanalAquisicao, DispositivoCadastro, AtribuicaoCategoria } from "../types/enums.js";

export const ORIGEM_ATRIBUICAO_LABELS = {
  INSTAGRAM_ADS: "Instagram Ads",
  FACEBOOK_ADS: "Facebook Ads",
  GOOGLE_ADS: "Google Ads",
  TIKTOK_ADS: "TikTok Ads",
  PLAY_STORE: "Play Store",
  APP_STORE: "App Store",
  INDICACAO: "Indicação",
  BLOG: "Blog Van360",
  SITE_INSTITUCIONAL: "Site Institucional",
  INSTAGRAM_ORGANICO: "Instagram",
  FACEBOOK_ORGANICO: "Facebook",
  GOOGLE_ORGANICO: "Google",
  DIRETO: "Direto / Orgânico",
} as const;

export const CAMPANHA_FALLBACK_LABELS = {
  META_ADS: "Meta Ads",
  CAMPANHA_GOOGLE: "Campanha Google",
  CAMPANHA_TIKTOK: "Campanha TikTok",
  APP_ANDROID: "App Nativo Android",
  APP_IOS: "App Nativo iOS",
  OUTRO_MOTORISTA: "Outro Motorista",
  ORGANICO: "Orgânico",
  DIRETO: "Direto",
  LINK_BIO: "Orgânico / Link Bio",
  BUSCA_ORGANICA: "Busca Orgânica",
  SEM_UTMS: "Sem UTMs",
} as const;

export type CategoriaOrigemAquisicao = AtribuicaoCategoria;

export interface ResolvedLeadAttribution {
  origem: string;
  categoria: AtribuicaoCategoria;
}

export interface ResolvedOrigemAtribuicao {
  label: string;
  detalhe?: string;
  categoria: AtribuicaoCategoria;
}

export function resolveOrigemAtribuicao(
  rawMetadados?: Record<string, unknown> | null,
  dispositivo?: string | null,
  canalAuto?: string | null
): ResolvedOrigemAtribuicao {
  const utm = (rawMetadados?.utm as Record<string, string | undefined> | null) || undefined;
  const source = utm?.source?.toLowerCase();
  const fbclid = utm?.fbclid;
  const gclid = utm?.gclid;
  const gbraid = utm?.gbraid;
  const ttclid = utm?.ttclid;
  const campaign = utm?.campaign;
  const content = utm?.content;
  const referrer = typeof rawMetadados?.referrer === "string" ? rawMetadados.referrer : undefined;

  const isInternalReferrer = Boolean(
    referrer && (
      referrer.includes("app.van360.com.br") ||
      referrer.includes("capacitor://") ||
      referrer.includes("localhost")
    )
  );
  const cleanReferrer = isInternalReferrer ? undefined : referrer;
  const dispUpper = dispositivo?.toUpperCase();

  if (source === "ig" || (source === "lp" && fbclid) || source === "instagram") {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.INSTAGRAM_ADS,
      detalhe: content || campaign || CAMPANHA_FALLBACK_LABELS.META_ADS,
      categoria: AtribuicaoCategoria.META_ADS,
    };
  }

  if (source === "fb" || source === "facebook" || fbclid) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.FACEBOOK_ADS,
      detalhe: content || campaign || CAMPANHA_FALLBACK_LABELS.META_ADS,
      categoria: AtribuicaoCategoria.META_ADS,
    };
  }

  if (source === "google" || gclid || gbraid) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.GOOGLE_ADS,
      detalhe: campaign || CAMPANHA_FALLBACK_LABELS.CAMPANHA_GOOGLE,
      categoria: AtribuicaoCategoria.GOOGLE_ADS,
    };
  }

  if (source === "tiktok" || ttclid) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.TIKTOK_ADS,
      detalhe: campaign || CAMPANHA_FALLBACK_LABELS.CAMPANHA_TIKTOK,
      categoria: AtribuicaoCategoria.TIKTOK_ADS,
    };
  }

  if (dispUpper === DispositivoCadastro.APP_ANDROID || dispUpper === "APP_ANDROID") {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.PLAY_STORE,
      detalhe: CAMPANHA_FALLBACK_LABELS.APP_ANDROID,
      categoria: AtribuicaoCategoria.PLAY_STORE,
    };
  }

  if (dispUpper === DispositivoCadastro.APP_IOS || dispUpper === "APP_IOS") {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.APP_STORE,
      detalhe: CAMPANHA_FALLBACK_LABELS.APP_IOS,
      categoria: AtribuicaoCategoria.PLAY_STORE,
    };
  }

  if (canalAuto === CanalAquisicao.INDICACAO) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.INDICACAO,
      detalhe: CAMPANHA_FALLBACK_LABELS.OUTRO_MOTORISTA,
      categoria: AtribuicaoCategoria.INDICACAO,
    };
  }

  if (source === "blog" || cleanReferrer?.includes("van360.com.br/blog")) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.BLOG,
      detalhe: CAMPANHA_FALLBACK_LABELS.ORGANICO,
      categoria: AtribuicaoCategoria.SITE_ORGANICO,
    };
  }

  if (source === "lp" || cleanReferrer?.includes("van360.com.br")) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.SITE_INSTITUCIONAL,
      detalhe: CAMPANHA_FALLBACK_LABELS.DIRETO,
      categoria: AtribuicaoCategoria.SITE_ORGANICO,
    };
  }

  if (cleanReferrer?.includes("instagram.com")) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.INSTAGRAM_ORGANICO,
      detalhe: CAMPANHA_FALLBACK_LABELS.LINK_BIO,
      categoria: AtribuicaoCategoria.SITE_ORGANICO,
    };
  }

  if (cleanReferrer?.includes("facebook.com")) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.FACEBOOK_ORGANICO,
      detalhe: CAMPANHA_FALLBACK_LABELS.ORGANICO,
      categoria: AtribuicaoCategoria.SITE_ORGANICO,
    };
  }

  if (cleanReferrer?.includes("google.")) {
    return {
      label: ORIGEM_ATRIBUICAO_LABELS.GOOGLE_ORGANICO,
      detalhe: CAMPANHA_FALLBACK_LABELS.BUSCA_ORGANICA,
      categoria: AtribuicaoCategoria.SITE_ORGANICO,
    };
  }

  return {
    label: ORIGEM_ATRIBUICAO_LABELS.DIRETO,
    detalhe: CAMPANHA_FALLBACK_LABELS.SEM_UTMS,
    categoria: AtribuicaoCategoria.DIRETO,
  };
}

export function resolveLeadAttribution(
  rawMetadados?: Record<string, unknown> | null,
  dispositivo?: string | null,
  canalAuto?: string | null
): ResolvedLeadAttribution {
  const resolved = resolveOrigemAtribuicao(rawMetadados, dispositivo, canalAuto);
  return {
    origem: resolved.label,
    categoria: resolved.categoria,
  };
}

