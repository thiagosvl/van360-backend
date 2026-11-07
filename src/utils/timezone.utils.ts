import type { Json } from "../types/database.types.js";
import { normalizePhone } from "./string.utils.js";

export const BrazilTimezone = {
  NORONHA: "America/Noronha",
  SAO_PAULO: "America/Sao_Paulo",
  FORTALEZA: "America/Fortaleza",
  BAHIA: "America/Bahia",
  RECIFE: "America/Recife",
  MACEIO: "America/Maceio",
  BELEM: "America/Belem",
  ARAGUAINA: "America/Araguaina",
  SANTAREM: "America/Santarem",
  CUIABA: "America/Cuiaba",
  CAMPO_GRANDE: "America/Campo_Grande",
  MANAUS: "America/Manaus",
  BOA_VISTA: "America/Boa_Vista",
  PORTO_VELHO: "America/Porto_Velho",
  RIO_BRANCO: "America/Rio_Branco",
  EIRUNEPE: "America/Eirunepe",
  PORTO_ACRE: "America/Porto_Acre",
} as const;

export const DEFAULT_BRAZIL_TIMEZONE = BrazilTimezone.SAO_PAULO;

const DDD_ACRE = "68";
const DDD_AMAZONAS_INTERIOR = "97";
const DDD_PERNAMBUCO_NORONHA = "81";
const UF_ACRE = "AC";
const UF_AMAZONAS = "AM";
const BR_PHONE_MIN_DIGITS = 10;
const UF_CODE_LENGTH = 2;
const REPEATED_DIGITS_REGEX = /^(\d)\1+$/;
const VALID_DDD_REGEX = /^[1-9][1-9]$/;

const UTC_MINUS_2_TIMEZONES = new Set<string>([
  BrazilTimezone.NORONHA,
]);

const UTC_MINUS_3_TIMEZONES = new Set<string>([
  BrazilTimezone.SAO_PAULO,
  BrazilTimezone.FORTALEZA,
  BrazilTimezone.BAHIA,
  BrazilTimezone.RECIFE,
  BrazilTimezone.MACEIO,
  BrazilTimezone.BELEM,
  BrazilTimezone.ARAGUAINA,
  BrazilTimezone.SANTAREM,
]);

const UTC_MINUS_4_TIMEZONES = new Set<string>([
  BrazilTimezone.CUIABA,
  BrazilTimezone.CAMPO_GRANDE,
  BrazilTimezone.MANAUS,
  BrazilTimezone.BOA_VISTA,
  BrazilTimezone.PORTO_VELHO,
]);

const UTC_MINUS_5_TIMEZONES = new Set<string>([
  BrazilTimezone.RIO_BRANCO,
  BrazilTimezone.EIRUNEPE,
  BrazilTimezone.PORTO_ACRE,
]);

const ALL_BRAZIL_TIMEZONES = new Set<string>([
  ...UTC_MINUS_2_TIMEZONES,
  ...UTC_MINUS_3_TIMEZONES,
  ...UTC_MINUS_4_TIMEZONES,
  ...UTC_MINUS_5_TIMEZONES,
]);

const DDD_TO_TIMEZONE_MAP: Record<string, string> = {
  "65": BrazilTimezone.CUIABA,
  "66": BrazilTimezone.CUIABA,
  "67": BrazilTimezone.CAMPO_GRANDE,
  [DDD_ACRE]: BrazilTimezone.RIO_BRANCO,
  "69": BrazilTimezone.PORTO_VELHO,
  "92": BrazilTimezone.MANAUS,
  "95": BrazilTimezone.BOA_VISTA,
  [DDD_AMAZONAS_INTERIOR]: BrazilTimezone.MANAUS,
};

const UF_TO_TIMEZONE_MAP: Record<string, string> = {
  [UF_ACRE]: BrazilTimezone.RIO_BRANCO,
  [UF_AMAZONAS]: BrazilTimezone.MANAUS,
  MS: BrazilTimezone.CAMPO_GRANDE,
  MT: BrazilTimezone.CUIABA,
  RO: BrazilTimezone.PORTO_VELHO,
  RR: BrazilTimezone.BOA_VISTA,
};

export interface TimezoneEntityInput {
  telefone?: string | null;
  estado?: string | null;
  metadados_cadastro?: Json | null;
}

export interface TimezoneResolutionInput {
  primary?: TimezoneEntityInput | null;
  fallback?: TimezoneEntityInput | null;
}

export const isValidIanaTimezone = (timeZone?: string | null): timeZone is string => {
  if (!timeZone || typeof timeZone !== "string" || !timeZone.trim()) {
    return false;
  }
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
};

const extractTimezoneFromMetadados = (metadados?: Json | null): string | null => {
  if (!metadados || typeof metadados !== "object" || Array.isArray(metadados)) {
    return null;
  }
  const rawTz = (metadados as Record<string, Json | undefined>).timezone;
  if (typeof rawTz === "string" && isValidIanaTimezone(rawTz)) {
    return rawTz.trim();
  }
  return null;
};

const extractBrazilianDdd = (telefone?: string | null): string | null => {
  const normalizedPhone = normalizePhone(telefone);
  const phoneWithoutLeadingZero = normalizedPhone.startsWith("0")
    ? normalizedPhone.substring(1)
    : normalizedPhone;

  if (phoneWithoutLeadingZero.length >= BR_PHONE_MIN_DIGITS && !REPEATED_DIGITS_REGEX.test(phoneWithoutLeadingZero)) {
    const candidateDdd = phoneWithoutLeadingZero.substring(0, 2);
    if (VALID_DDD_REGEX.test(candidateDdd)) {
      return candidateDdd;
    }
  }
  return null;
};

const resolveSingleEntityTimezone = (entity?: TimezoneEntityInput | null): string | null => {
  if (!entity) return null;

  const metadataTz = extractTimezoneFromMetadados(entity.metadados_cadastro);
  const ddd = extractBrazilianDdd(entity.telefone);
  const uf = entity.estado && typeof entity.estado === "string" ? entity.estado.trim().toUpperCase() : null;

  if (ddd === DDD_ACRE || (!ddd && uf === UF_ACRE)) {
    if (metadataTz && UTC_MINUS_5_TIMEZONES.has(metadataTz)) {
      return metadataTz;
    }
    return BrazilTimezone.RIO_BRANCO;
  }

  if (ddd === DDD_AMAZONAS_INTERIOR || (!ddd && uf === UF_AMAZONAS)) {
    if (metadataTz && (UTC_MINUS_4_TIMEZONES.has(metadataTz) || UTC_MINUS_5_TIMEZONES.has(metadataTz))) {
      return metadataTz;
    }
    return BrazilTimezone.MANAUS;
  }

  const dddMappedTz = ddd ? DDD_TO_TIMEZONE_MAP[ddd] : undefined;
  const ufMappedTz = !ddd && uf ? UF_TO_TIMEZONE_MAP[uf] : undefined;
  const targetRegionalTz = dddMappedTz || ufMappedTz;

  if (targetRegionalTz && UTC_MINUS_4_TIMEZONES.has(targetRegionalTz)) {
    if (metadataTz && UTC_MINUS_4_TIMEZONES.has(metadataTz)) {
      return metadataTz;
    }
    return targetRegionalTz;
  }

  if (ddd === DDD_PERNAMBUCO_NORONHA && metadataTz && UTC_MINUS_2_TIMEZONES.has(metadataTz)) {
    return metadataTz;
  }

  if (ddd || (uf && uf.length === UF_CODE_LENGTH)) {
    if (metadataTz && UTC_MINUS_3_TIMEZONES.has(metadataTz)) {
      return metadataTz;
    }
    return DEFAULT_BRAZIL_TIMEZONE;
  }

  if (metadataTz && ALL_BRAZIL_TIMEZONES.has(metadataTz)) {
    return metadataTz;
  }

  return metadataTz || null;
};

export const resolveBrazilTimezone = (input: TimezoneResolutionInput): string => {
  const primaryTz = resolveSingleEntityTimezone(input.primary);
  if (primaryTz) {
    return primaryTz;
  }

  const fallbackTz = resolveSingleEntityTimezone(input.fallback);
  if (fallbackTz) {
    return fallbackTz;
  }

  return DEFAULT_BRAZIL_TIMEZONE;
};
