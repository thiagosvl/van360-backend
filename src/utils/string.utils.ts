export function cleanString(str: string, capitalize = false): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

export const onlyDigits = (value: string | null | undefined): string => {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
};

export const formatEvolutionNumber = (phoneNumber: string): string => {
  if (!phoneNumber) return "";
  const cleanNumber = onlyDigits(phoneNumber);
  return cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
};

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
