export function cleanString(str: string, capitalize = false): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

export const onlyDigits = (value: string | null | undefined): string => {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
};

export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return email;
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;

  const len = name.length;
  let maskedName = "";

  if (len <= 2) {
    maskedName = `${name.substring(0, 1)}*`;
  } else if (len === 3) {
    maskedName = `${name.substring(0, 1)}*${name.substring(len - 1)}`;
  } else if (len === 4) {
    maskedName = `${name.substring(0, 1)}**${name.substring(len - 1)}`;
  } else {
    const firstTwo = name.substring(0, 2);
    const lastTwo = name.substring(len - 2);
    const asteriskCount = Math.min(6, len - 4);
    maskedName = `${firstTwo}${"*".repeat(asteriskCount)}${lastTwo}`;
  }

  return `${maskedName}@${domain}`;
}

export const formatEvolutionNumber = (phoneNumber: string): string => {
  if (!phoneNumber) return "";
  const cleanNumber = onlyDigits(phoneNumber);
  return cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
};

export function getPhoneVariants(phoneNumber: string | null | undefined): string[] {
  if (!phoneNumber) return [];
  const digits = onlyDigits(phoneNumber);
  if (!digits) return [];
  const phoneWithout55 = digits.startsWith('55') && digits.length > 11 ? digits.substring(2) : digits;
  const phoneWith55 = `55${phoneWithout55}`;
  return Array.from(new Set([digits, phoneWithout55, phoneWith55].filter(Boolean)));
}

export function extractErrorMessage(error: unknown, fallback = "Erro desconhecido"): string {
  if (!error) return fallback;
  if (typeof error === "string") {
    return error === "[object Object]" ? fallback : error;
  }
  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    const rawMsg = errObj.error_description ?? errObj.message ?? errObj.error;
    if (typeof rawMsg === "string" && rawMsg !== "[object Object]") {
      return rawMsg;
    }
    if (typeof rawMsg === "object" && rawMsg !== null) {
      const nestedMsg = (rawMsg as Record<string, unknown>).message;
      if (typeof nestedMsg === "string" && nestedMsg !== "[object Object]") {
        return nestedMsg;
      }
      try {
        return JSON.stringify(rawMsg);
      } catch {
        return fallback;
      }
    }
    if (Array.isArray(rawMsg) && rawMsg.length > 0) {
      return extractErrorMessage(rawMsg[0], fallback);
    }
    try {
      const json = JSON.stringify(error);
      return json === "{}" ? fallback : json;
    } catch {
      return fallback;
    }
  }
  return String(error);
}
