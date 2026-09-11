import { FastifyRequest } from "fastify";
import { DispositivoCadastro } from "../types/enums.js";

export interface ParsedClientUserAgent {
  so: string;
  navegador: string;
  tipo: "Mobile" | "Tablet" | "Desktop" | "Desconhecido";
  resumo: string;
}

export interface ClientAccessData {
  ip: string;
  userAgent: string | null;
  dispositivo: string;
  dispositivoCadastro: DispositivoCadastro;
  metadados: Record<string, unknown>;
}

export function getClientIp(request: FastifyRequest): string {
  const cfConnectingIp = request.headers["cf-connecting-ip"];
  if (typeof cfConnectingIp === "string" && cfConnectingIp.trim()) {
    return cfConnectingIp.trim();
  }

  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  return request.ip || "0.0.0.0";
}

export function parseUserAgent(userAgent?: string | null): ParsedClientUserAgent {
  if (!userAgent || typeof userAgent !== "string") {
    return {
      so: "Desconhecido",
      navegador: "Desconhecido",
      tipo: "Desconhecido",
      resumo: "Desconhecido",
    };
  }

  let so = "Desconhecido";
  if (/windows/i.test(userAgent)) so = "Windows";
  else if (/android/i.test(userAgent)) so = "Android";
  else if (/iphone|ipad|ipod/i.test(userAgent)) so = "iOS";
  else if (/macintosh|mac os x/i.test(userAgent)) so = "macOS";
  else if (/cros/i.test(userAgent)) so = "Chrome OS";
  else if (/linux/i.test(userAgent)) so = "Linux";

  let navegador = "Desconhecido";
  if (/edg\//i.test(userAgent)) navegador = "Edge";
  else if (/opr\/|opera/i.test(userAgent)) navegador = "Opera";
  else if (/samsungbrowser/i.test(userAgent)) navegador = "Samsung Internet";
  else if (/chrome|crios/i.test(userAgent)) navegador = "Chrome";
  else if (/firefox|fxios/i.test(userAgent)) navegador = "Firefox";
  else if (/safari/i.test(userAgent)) navegador = "Safari";

  let tipo: "Mobile" | "Tablet" | "Desktop" | "Desconhecido" = "Desktop";
  if (/ipad|tablet/i.test(userAgent)) {
    tipo = "Tablet";
  } else if (/mobile|iphone|android/i.test(userAgent)) {
    tipo = "Mobile";
  }

  const resumo = so !== "Desconhecido" && navegador !== "Desconhecido"
    ? `${navegador} (${so})`
    : navegador !== "Desconhecido"
    ? navegador
    : so;

  return { so, navegador, tipo, resumo };
}

export function resolveDispositivoCadastro(
  clientHint?: string | null,
  userAgent?: string | null
): DispositivoCadastro {
  const validEnums = Object.values(DispositivoCadastro);
  if (clientHint && validEnums.includes(clientHint as DispositivoCadastro)) {
    return clientHint as DispositivoCadastro;
  }

  if (!userAgent) return DispositivoCadastro.WEB_DESKTOP;

  const isAndroid = /android/i.test(userAgent);
  const isIos = /iphone|ipad|ipod/i.test(userAgent);

  if (isAndroid) return DispositivoCadastro.WEB_MOBILE_ANDROID;
  if (isIos) return DispositivoCadastro.WEB_MOBILE_IOS;

  return DispositivoCadastro.WEB_DESKTOP;
}

export function extractClientAccessData(
  request: FastifyRequest,
  extraMetadata?: Record<string, unknown> | null,
  clientDispositivo?: string | null
): ClientAccessData {
  const ip = getClientIp(request);
  const rawUserAgent = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : null;
  const parsedUa = parseUserAgent(rawUserAgent);
  const referrer = typeof request.headers["referer"] === "string" ? request.headers["referer"] : typeof request.headers["referrer"] === "string" ? request.headers["referrer"] : null;

  const dispositivoCadastro = resolveDispositivoCadastro(clientDispositivo, rawUserAgent);

  const metadados: Record<string, unknown> = {
    ...(extraMetadata || {}),
    ip: ip || (extraMetadata?.ip as string | undefined),
    user_agent: rawUserAgent || (extraMetadata?.user_agent as string | undefined),
    referrer: referrer || (extraMetadata?.referrer as string | undefined),
    dispositivo_resumo: parsedUa.resumo,
    so: parsedUa.so,
    navegador: parsedUa.navegador,
  };

  return {
    ip,
    userAgent: rawUserAgent,
    dispositivo: parsedUa.tipo,
    dispositivoCadastro,
    metadados,
  };
}
