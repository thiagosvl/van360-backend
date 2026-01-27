/**
 * Formata um número para o padrão de moeda brasileiro (BRL)
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(value);
}

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 */
export function formatDate(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR').format(d);
}

/**
 * Formata uma data e hora para o padrão brasileiro
 */
export function formatDateTime(date: string | Date): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(d);
}

/**
 * Retorna apenas o primeiro nome de uma string
 */
export function getFirstName(name?: string): string {
    if (!name) return "";
    return name.trim().split(/\s+/)[0];
}

export function maskCpf(value: string) {
    return value
        .replace(/\D/g, "")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})/, "$1-$2")
        .replace(/(-\d{2})\d+?$/, "$1");
}

export function maskCnpj(value: string) {
    return value
        .replace(/\D/g, "")
        .replace(/(\d{2})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2")
        .replace(/(-\d{2})\d+?$/, "$1");
}

export function maskPhone(value: string) {
    let r = value.replace(/\D/g, "");
    if (r.length > 11) {
        r = r.slice(0, 11);
    }
    if (r.length > 10) {
        return r.replace(/^(\d\d)(\d{5})(\d{4}).*/, "($1) $2-$3");
    } else if (r.length > 5) {
        return r.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    } else if (r.length > 2) {
        return r.replace(/^(\d\d)(\d{0,5}).*/, "($1) $2");
    } else {
        return r.replace(/^(\d*)/, "($1");
    }
}

export function maskEvp(value: string) {
    const cleanValue = value.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32);
    return cleanValue
        .replace(/^([a-zA-Z0-9]{8})([a-zA-Z0-9])/, '$1-$2')
        .replace(/^([a-zA-Z0-9]{8})-([a-zA-Z0-9]{4})([a-zA-Z0-9])/, '$1-$2-$3')
        .replace(/^([a-zA-Z0-9]{8})-([a-zA-Z0-9]{4})-([a-zA-Z0-9]{4})([a-zA-Z0-9])/, '$1-$2-$3-$4')
        .replace(/^([a-zA-Z0-9]{8})-([a-zA-Z0-9]{4})-([a-zA-Z0-9]{4})-([a-zA-Z0-9]{4})([a-zA-Z0-9])/, '$1-$2-$3-$4-$5');
}

export function formatPixKey(key: string, type: string) {
    if (!key) return "";

    // Normalizar tipo 
    const t = type ? type.toUpperCase() : "";
    const clean = key.replace(/\D/g, "");

    if (t === "CPF") return maskCpf(clean);
    if (t === "CNPJ") return maskCnpj(clean);
    if (t === "TELEFONE") return maskPhone(key);
    if (t === "ALEATORIA" || t === "EVP") return maskEvp(key);

    return key;
}
