/**
 * Utilitário de Máscaras para Dados Sensíveis (LGPD / Padrão de Mercado)
 */

/**
 * Mascara um endereço de e-mail no formato seguro (ex: th*****@hotmail.com)
 */
export function maskEmail(email: string): string {
    if (!email || !email.includes("@")) return email || "";

    const [username, domain] = email.split("@");

    if (username.length <= 2) {
        return `${username[0]}***@${domain}`;
    }

    const prefix = username.slice(0, 2);
    const starCount = Math.min(username.length - 2, 5);
    const stars = "*".repeat(starCount);

    return `${prefix}${stars}@${domain}`;
}

/**
 * Mascara um número de telefone no formato BR (ex: (XX) XXXXX-6951)
 */
export function maskPhone(phone: string): string {
    if (!phone) return "";
    const clean = phone.replace(/\D/g, "");
    if (clean.length < 4) return "(XX) XXXXX-****";
    const lastDigits = clean.slice(-4);
    return `(XX) XXXXX-${lastDigits}`;
}
