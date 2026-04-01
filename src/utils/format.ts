import { PassageiroGenero, PassageiroModalidade, PeriodoEnum } from "../types/enums.js";

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
    `${data.cidade}${data.estado ? `/${data.estado.toUpperCase()}` : ""}`
  ].filter(Boolean);
  return parts.join(" - ");
};

export const formatPaymentMethod = (method: string): string => {
  const labels: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    transferencia: "Transferência",
    boleto: "Boleto",
    "cartao-credito": "Crédito",
    "cartao-debito": "Débito",
  };
  return labels[method] || (method ? method.charAt(0).toUpperCase() + method.slice(1) : "");
};

export const capitalize = (str?: string): string => {
  if (!str) return "";
  return str
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
