import { logger } from "../config/logger.js";

/**
 * Analisa uma data ou string de data e a ajusta para o fuso horário de Brasília,
 * mantendo o dia, mês e ano pretendidos sem o deslocamento UTC comum.
 * 
 * @param date string (ISO ou YYYY-MM-DD) ou objeto Date
 * @returns Objeto Date cujos métodos locais (.getHours, .getDate) refletem Brasília
 */
export const parseLocalDate = (date: Date | string): Date => {
  if (typeof date === 'string') {
    // Caso 1: Apenas data YYYY-MM-DD (ex: nascimento, vencimento)
    // Forçamos para o meio do dia (12h) para evitar qualquer oscilação de fuso mudar o dia
    if (date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return new Date(`${date}T12:00:00-03:00`);
    }

    // Caso 2: String ISO completa ou parcial
    const d = new Date(date);
    if (isNaN(d.getTime())) {
      logger.warn({ date }, "Data inválida recebida no parseLocalDate. Retornando data atual.");
      return getNowBR();
    }
    return parseLocalDate(d); // Recorre para extrair partes
  }
  
  // Caso 3: Objeto Date - Extraímos as partes reais segundo o fuso de SP
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23' // h23 garante range 0-23; hour12:false pode retornar "24" à meia-noite em Node.js
  });
  
  const p = formatter.formatToParts(date).reduce((acc, part) => {
    acc[part.type] = part.value;
    return acc;
  }, {} as any);
  
  // Retorna um novo objeto Date que representa o mesmo instante,
  // mas construído de forma que as partes locais batam com Brasília.
  return new Date(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`);
};

/**
 * Retorna a data e hora atual em Brasília.
 */
export const getNowBR = (): Date => {
  return parseLocalDate(new Date());
};

export const createLocalDateBR = (year: number, month: number, day: number, hour = 12, minute = 0, second = 0, ms = 0): Date => {
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  const h = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");
  const s = String(second).padStart(2, "0");
  const mill = String(ms).padStart(3, "0");
  return new Date(`${year}-${m}-${d}T${h}:${min}:${s}.${mill}-03:00`);
};

export const getEndOfDayBR = (date?: Date | string): Date => {
  const d = date ? parseLocalDate(date) : getNowBR();
  const dateStr = toPersistenceString(d);
  return new Date(`${dateStr}T23:59:59.999-03:00`);
};

export const getStartOfDayBR = (date?: Date | string): Date => {
  const d = date ? parseLocalDate(date) : getNowBR();
  const dateStr = toPersistenceString(d);
  return new Date(`${dateStr}T00:00:00.000-03:00`);
};

export const toPersistenceString = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
};

export const toLocalDateString = (date: Date | string): string => {
  return toPersistenceString(date);
};

export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(d);
};

export const formatToBrazilianDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
};

export const getMonthNameBR = (monthNumber?: number): string => {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return "";
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return names[monthNumber - 1];
};

export const getShortWeekDayBR = (date: Date): string => {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return days[date.getDay()];
};

export const getLastDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
};

/**
 * Retorna uma string YYYY-MM-DD segura para o vencimento projetado de um mês/ano,
 * ajustando o dia para o último dia do mês caso o mês seja menor (ex: dia 31 em Fev -> 28).
 */
export const getSafeDueDateString = (diaVencimento: number | null | undefined, month: number, year: number): string => {
  const lastDay = getLastDayOfMonth(year, month);
  const rawDia = Number(diaVencimento || 10);
  const diaFinal = Math.min(rawDia, lastDay);
  const mesStr = String(month).padStart(2, "0");
  const diaStr = String(diaFinal).padStart(2, "0");
  return `${year}-${mesStr}-${diaStr}`;
};

export const addDays = (date: Date | string, days: number): Date => {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const addMonths = (date: Date | string, months: number): Date => {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
};

export const addMinutes = (date: Date | string, minutes: number): Date => {
  const d = typeof date === 'string' ? parseLocalDate(date) : new Date(date);
  d.setMinutes(d.getMinutes() + minutes);
  return d;
};

export const isBeforeNowBR = (date: Date | string): boolean => {
  const target = typeof date === 'string' ? parseLocalDate(date) : date;
  return target.getTime() < getNowBR().getTime();
};

/**
 * Retorna a diferença em dias de calendário entre duas datas (d2 - d1).
 */
export const diffInDays = (d1: Date | string, d2: Date | string): number => {
  const start = getStartOfDayBR(d1);
  const end = getStartOfDayBR(d2);
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
};

export const parseBrazilianDateToISO = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;

  if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    return dateStr;
  }

  const cleanDate = dateStr.replace(/\D/g, "");
  if (cleanDate.length === 8) {
    const dia = cleanDate.substring(0, 2);
    const mes = cleanDate.substring(2, 4);
    const ano = cleanDate.substring(4, 8);
    return `${ano}-${mes}-${dia}`;
  }

  if (dateStr.includes("-")) {
    return dateStr;
  }

  return null;
};

export const parseMonthYearFromDateString = (dateStr?: string | null): { year: number; month: number } | null => {
  if (!dateStr) return null;

  if (typeof dateStr === "string" && dateStr.includes("-")) {
    const parts = dateStr.split("-");
    if (parts.length >= 2) {
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
};
