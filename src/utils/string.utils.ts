export function cleanString(str: string, capitalize = false): string {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

export const onlyDigits = (value: string | null | undefined): string => {
  if (!value) return "";
  return String(value).replace(/\D/g, "");
};

export const formatWhatsAppNumber = (phoneNumber: string): string => {
  if (!phoneNumber) return "";
  const cleanNumber = onlyDigits(phoneNumber);
  return cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
};
