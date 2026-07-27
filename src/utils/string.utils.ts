export function cleanString(str: string, capitalize = false) {
  if (!str) return "";
  return str.trim().replace(/\s+/g, " ");
}

export const onlyDigits = (value: string): string => {
  return value.replace(/\D/g, '');
}

export const formatWhatsAppNumber = (phoneNumber: string): string => {
  if (!phoneNumber) return "";
  const cleanNumber = onlyDigits(phoneNumber);
  return cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
}
