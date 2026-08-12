import { formatToBrazilianDate, getMonthNameBR } from "../../../utils/date.utils.js";
import { formatCurrency, maskCpf, maskCnpj, maskPhone, formatCpfCnpj, getFirstName, getFirstAndSecondName } from "../../../utils/format.js";
import { TipoChavePix } from "../../../types/enums.js";

/**
 * NotificationContextFormatter (SSOT - Formatação Unificada para Notificações)
 * Centraliza a sanitização e formatação de nomes, valores monetários, datas e chaves Pix.
 */
export class NotificationContextFormatter {
    /**
     * Extrai apenas o primeiro nome da pessoa para uma comunicação amigável
     */
    static getFirstName(fullName?: string, fallback = "Usuário"): string {
        const formatted = getFirstName(fullName);
        return formatted || fallback;
    }

    /**
     * Extrai o nome e o primeiro sobrenome (2 primeiros nomes) reutilizando o utilitário central getFirstAndSecondName
     */
    static getFirstAndLastName(fullName?: string, fallback = "Passageiro"): string {
        const formatted = getFirstAndSecondName(fullName);
        return formatted || fallback;
    }

    /**
     * Formata um valor monetário numérico para a representação em BRL R$ X,XX (ex: "R$ 250,00")
     */
    static formatValue(value?: number | string): string {
        if (typeof value === "number") {
            return formatCurrency(value);
        }
        return value || "0,00";
    }

    /**
     * Formata um valor monetário sem o prefixo 'R$' (ex: "250,00"),
     * ideal para templates do WhatsApp (WABA) que já possuem 'R$' impresso no texto estático da Meta.
     */
    static formatRawValue(value?: number | string): string {
        const formatted = this.formatValue(value);
        return formatted.replace(/^R\$\s*/i, "").replace(/^R\$\xa0/i, "").trim();
    }

    /**
     * Formata uma string de data para o padrão brasileiro DD/MM/AAAA
     */
    static formatDate(dateStr?: string): string {
        if (!dateStr) return "";
        return formatToBrazilianDate(dateStr);
    }

    /**
     * Retorna o nome do mês por extenso em Português
     */
    static getMonthLabel(month?: number | string): string {
        if (typeof month === "number") {
            return getMonthNameBR(month);
        }
        if (typeof month === "string" && !isNaN(Number(month))) {
            return getMonthNameBR(Number(month));
        }
        return month || "Mensalidade";
    }

    /**
     * Formata um CPF ou CNPJ com a máscara correspondente
     */
    static formatCpfCnpj(value?: string | null): string {
        return formatCpfCnpj(value);
    }

    /**
     * Formata a chave Pix com a máscara adequada de acordo com o tipo (CPF, CNPJ, Telefone, E-mail, Chave Aleatória)
     */
    static formatPixKey(pixKey: string, pixType?: string): { key: string; typeLabel: string } {
        const rawKey = (pixKey || "").trim();
        const typeStr = (pixType || "").trim().toUpperCase();

        let formattedKey = rawKey;
        let label = "Chave Pix";

        switch (typeStr) {
            case TipoChavePix.CPF:
                formattedKey = maskCpf(rawKey) || rawKey;
                label = "CPF";
                break;
            case TipoChavePix.CNPJ:
                formattedKey = maskCnpj(rawKey) || rawKey;
                label = "CNPJ";
                break;
            case TipoChavePix.TELEFONE:
            case "PHONE":
                formattedKey = maskPhone(rawKey) || rawKey;
                label = "Telefone";
                break;
            case TipoChavePix.EMAIL:
                label = "E-mail";
                break;
            case TipoChavePix.ALEATORIA:
            case "EVP":
                label = "Chave Aleatória";
                break;
        }

        return { key: formattedKey, typeLabel: label };
    }
}
