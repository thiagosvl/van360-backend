export function cleanString(str, capitalize = false) {
    if (!str)
        return "";
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
export const moneyToNumber = (value) => {
    if (!value)
        return 0;
    const numericString = value
        .replace(/[R$\s]/g, '')
        .replace(/\./g, '')
        .replace(',', '.');
    return parseFloat(numericString) || 0;
};
export const toLocalDateString = (date) => {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
};
export const onlyDigits = (value) => {
    return value.replace(/\D/g, '');
};
