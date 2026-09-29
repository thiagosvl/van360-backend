export const moneyToNumber = (value: string | number): number => {
  if (typeof value === "number") return isNaN(value) ? 0 : value;
  if (!value) return 0;

  let str = String(value).trim();
  str = str.replace(/[R$\s]/g, "");
  if (!str) return 0;

  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else {
    const parts = str.split(".");
    if (parts.length > 2) {
      str = str.replace(/\./g, "");
    } else if (parts.length === 2 && parts[1].length === 3) {
      str = str.replace(/\./g, "");
    }
  }

  const result = parseFloat(str);
  return isNaN(result) ? 0 : result;
};
