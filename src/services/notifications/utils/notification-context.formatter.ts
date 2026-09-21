import { formatToBrazilianDate, getMonthNameBR, getMonthShortBR } from "../../../utils/date.utils.js";
import { formatCurrency, maskCpf, maskCnpj, maskPhone, formatCpfCnpj, getFirstName, getFirstAndSecondName } from "../../../utils/format.js";
import { TipoChavePix, PassageiroGenero } from "../../../types/enums.js";

export class NotificationContextFormatter {
    static getFirstName(fullName?: string, fallback = "Usuário"): string {
        if (fullName && /^TESTE\s+/i.test(fullName.trim())) {
            const parts = fullName.trim().split(/\s+/);
            return parts.slice(0, 2).join(" ");
        }
        const formatted = getFirstName(fullName);
        return formatted || fallback;
    }

    static getFirstAndLastName(fullName?: string, fallback = "Aluno"): string {
        const formatted = getFirstAndSecondName(fullName);
        return formatted || fallback;
    }

    static formatValue(value?: number | string): string {
        if (typeof value === "number") {
            return formatCurrency(value);
        }
        return value || "0,00";
    }

    static formatRawValue(value?: number | string): string {
        const formatted = this.formatValue(value);
        return formatted.replace(/^R\$\s*/i, "").replace(/^R\$\xa0/i, "").trim();
    }

    static formatDate(dateStr?: string): string {
        if (!dateStr) return "";
        return formatToBrazilianDate(dateStr);
    }

    static getMonthLabel(month?: number | string): string {
        if (typeof month === "number") {
            return getMonthNameBR(month);
        }
        if (typeof month === "string" && !isNaN(Number(month))) {
            return getMonthNameBR(Number(month));
        }
        return month || "Mensalidade";
    }

    static formatMonthYearShort(month?: number | string, year?: number | string): string {
        const m = typeof month === "string" ? Number(month) : month;
        const monthStr = getMonthShortBR(m);
        if (!monthStr) return "";

        if (!year) return monthStr;

        const y = String(year).trim();
        const shortYear = y.length >= 2 ? y.slice(-2) : y;
        return `${monthStr}/${shortYear}`;
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

    static getStudentTitle(genero?: PassageiroGenero | string | null): string {
        return genero === PassageiroGenero.FEMININO ? "A aluna" : "O aluno";
    }

    static getStudentNoun(genero?: PassageiroGenero | string | null): string {
        return genero === PassageiroGenero.FEMININO ? "aluna" : "aluno";
    }

    static getStudentArticle(genero?: PassageiroGenero | string | null, uppercase: boolean = false): string {
        const isFeminino = genero === PassageiroGenero.FEMININO;
        if (uppercase) {
            return isFeminino ? "A" : "O";
        }
        return isFeminino ? "a" : "o";
    }

    static formatTime(timeOrDate?: string | Date | null): string {
        if (!timeOrDate) {
            return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        }
        if (timeOrDate instanceof Date) {
            return timeOrDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
        }
        if (typeof timeOrDate === "string") {
            if (/^\d{2}:\d{2}$/.test(timeOrDate)) return timeOrDate;
            const parsed = new Date(timeOrDate);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            }
        }
        return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    }
}
