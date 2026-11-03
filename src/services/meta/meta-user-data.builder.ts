import type { MetaUserData } from "./meta-capi.client.js";

export interface MetaUserSource {
  id: string;
  email?: string | null;
  telefone?: string | null;
  nome?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  data_nascimento?: string | null;
  created_at?: string | null;
  metadados_cadastro?: unknown;
}

export interface MetaRequestContext {
  clientIp?: string | null;
  clientUserAgent?: string | null;
}

interface StoredMetaCookies {
  fbp?: unknown;
  fbc?: unknown;
}

interface StoredUtm {
  fbclid?: unknown;
  fbclid_at?: unknown;
}

const META_COUNTRY_BR = "br";
const FBC_PATTERN = /^fb\.\d\.\d+\..+$/;
const FBP_PATTERN = /^fb\.\d\.\d+\.\d+$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeText(value?: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return normalized || undefined;
}

function normalizeEmail(value?: string | null): string | undefined {
  const email = value?.trim().toLowerCase();
  return email && email.includes("@") ? email : undefined;
}

function normalizePhone(value?: string | null): string | undefined {
  const digits = value?.replace(/\D/g, "");
  if (!digits || digits.length < 10) return undefined;
  return digits.startsWith("55") && digits.length >= 12 ? digits : `55${digits}`;
}

function normalizeState(value?: string | null): string | undefined {
  const uf = normalizeText(value);
  return uf && uf.length === 2 ? uf : undefined;
}

function normalizeZip(value?: string | null): string | undefined {
  const digits = value?.replace(/\D/g, "");
  return digits && digits.length === 8 ? digits : undefined;
}

function normalizeDateOfBirth(value?: string | null): string | undefined {
  if (!value) return undefined;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  const br = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}${br[2]}${br[1]}`;
  return undefined;
}

function splitName(nome?: string | null): { firstName?: string; lastName?: string } {
  const parts = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return {
    firstName: normalizeText(parts[0]),
    lastName: parts.length > 1 ? normalizeText(parts[parts.length - 1]) : undefined,
  };
}

// Formato exigido pela Meta: fb.1.<timestamp do clique em ms>.<fbclid>. Sem o horário real do clique, usamos o do cadastro.
function resolveFbc(meta: StoredMetaCookies, utm: StoredUtm, createdAt?: string | null): string | undefined {
  const cookie = asString(meta.fbc);
  if (cookie && FBC_PATTERN.test(cookie)) return cookie;

  const fbclid = asString(utm.fbclid);
  if (!fbclid) return undefined;

  const clickedAt = Number(utm.fbclid_at);
  const createdAtMs = createdAt ? Date.parse(createdAt) : NaN;
  const timestamp = Number.isFinite(clickedAt) && clickedAt > 0
    ? clickedAt
    : Number.isFinite(createdAtMs) ? createdAtMs : Date.now();

  return `fb.1.${Math.floor(timestamp)}.${fbclid}`;
}

export function buildMetaUserData(user: MetaUserSource, context: MetaRequestContext = {}): MetaUserData {
  const metadados = asRecord(user.metadados_cadastro);
  const meta = asRecord(metadados.meta) as StoredMetaCookies;
  const utm = asRecord(metadados.utm) as StoredUtm;
  const fbp = asString(meta.fbp);

  return {
    email: normalizeEmail(user.email),
    phone: normalizePhone(user.telefone),
    externalId: user.id,
    ...splitName(user.nome),
    city: normalizeText(user.cidade),
    state: normalizeState(user.estado),
    zip: normalizeZip(user.cep),
    country: META_COUNTRY_BR,
    dateOfBirth: normalizeDateOfBirth(user.data_nascimento),
    clientIp: context.clientIp || asString(metadados.ip),
    clientUserAgent: context.clientUserAgent || asString(metadados.user_agent),
    fbp: fbp && FBP_PATTERN.test(fbp) ? fbp : undefined,
    fbc: resolveFbc(meta, utm, user.created_at),
  };
}
