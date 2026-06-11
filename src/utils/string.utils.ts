export function cleanString(str: string, capitalize = false) {
  if (!str) return "";

  let cleaned = str.trim().replace(/\s+/g, " ");

  if (capitalize) {
    cleaned = cleaned
      .toLowerCase()
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  return cleaned;
}

export const onlyDigits = (value: string): string => {
  return value.replace(/\D/g, '');
}

export const formatWhatsAppNumber = (phoneNumber: string): string => {
  if (!phoneNumber) return "";
  const cleanNumber = onlyDigits(phoneNumber);
  return cleanNumber.length <= 11 ? `55${cleanNumber}` : cleanNumber;
}
