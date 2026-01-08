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
