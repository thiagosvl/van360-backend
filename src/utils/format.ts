import { PassageiroGenero, PassageiroModalidade, PeriodoEnum, PixKeyType } from "../types/enums.js";

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
    let d = date;
    if (typeof date === 'string') {
        // Adicionar meio-dia para evitar problemas de fuso horário em strings de data simples (YYYY-MM-DD)
        // Isso garante que "2026-12-31" não vire "30/12/2026" devido ao deslocamento UTC-3
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            d = new Date(date + 'T12:00:00');
        } else {
            d = new Date(date);
        }
    }
    return new Intl.DateTimeFormat('pt-BR').format(d as Date);
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

    if (t === PixKeyType.CPF) return maskCpf(clean);
    if (t === PixKeyType.CNPJ) return maskCnpj(clean);
    if (t === PixKeyType.TELEFONE) return maskPhone(key);
    if (t === PixKeyType.ALEATORIA) return maskEvp(key);

    return key;
}

export const formatPeriodo = (periodo: string): string => {
  if (periodo === PeriodoEnum.INTEGRAL) return "Integral";
  if (periodo === PeriodoEnum.MANHA) return "Manhã";
  if (periodo === PeriodoEnum.TARDE) return "Tarde";
  if (periodo === PeriodoEnum.NOITE) return "Noite";

  return "Não Identificado";
};

export const formatModalidade = (modalidade: string): string => {
  switch (modalidade) {
    case PassageiroModalidade.IDA: return 'Ida';
    case PassageiroModalidade.VOLTA: return 'Volta';
    case PassageiroModalidade.IDA_VOLTA: return 'Ida e Volta';
    default: return modalidade || 'Não informada';
  }
};

export const formatGenero = (genero: string): string => {
  switch (genero) {
    case PassageiroGenero.MASCULINO: return 'Masculino';
    case PassageiroGenero.FEMININO: return 'Feminino';
    case PassageiroGenero.PREFIRO_NAO_INFORMAR: return 'Prefiro não informar';
    default: return genero || 'Não informado';
  }
};

export const formatParentesco = (parentesco: string): string => {
  switch (parentesco) {
    case 'pai': return 'Pai';
    case 'mae': return 'Mãe';
    case 'avo': return 'Avô/Avó';
    case 'tio': return 'Tio/Tia';
    case 'irmao': return 'Irmão/Irmã';
    case 'primo': return 'Primo/Prima';
    case 'padrastro': return 'Padrasto';
    case 'madrasta': return 'Madrasta';
    case 'responsavel_legal': return 'Responsável Legal';
    case 'outro': return 'Outro';
    default: return parentesco || 'Não informado';
  }
};

export const formatAddress = (data: { logradouro?: string; numero?: string; bairro?: string; cidade?: string; estado?: string }): string => {
    if (!data.logradouro) return "";
    const parts = [
        `${data.logradouro}${data.numero ? `, ${data.numero}` : ""}`,
        data.bairro,
        `${data.cidade}${data.estado ? `/${data.estado}` : ""}`
    ].filter(Boolean);
    return parts.join(" - ");
};
