const REGEX_PLACA_ANTIGA = /^[A-Z]{3}[0-9]{4}$/;
const REGEX_PLACA_MERCOSUL = /^[A-Z]{3}[0-9][A-Z][0-9]{2}$/;

/**
 * Formata uma placa para exibição (com hífen se for padrão antigo)
 */
export function formatarPlacaExibicao(placa: string): string {
    if (!placa) return "";
    const limpa = placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
    
    if (REGEX_PLACA_ANTIGA.test(limpa)) {
        return `${limpa.substring(0, 3)}-${limpa.substring(3)}`;
    }
    
    return limpa; // Mercosul ou placa incompleta/inválida exibe sem máscara especial
}

/**
 * Remove caracteres especiais e padroniza para maiúsculas
 */
export function limparPlaca(valor: string): string {
    return (valor || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Valida se a placa segue o padrão nacional (Antigo ou Mercosul)
 */
export function validarPlaca(valor: string): boolean {
    const limpa = limparPlaca(valor);
    return REGEX_PLACA_ANTIGA.test(limpa) || REGEX_PLACA_MERCOSUL.test(limpa);
}
