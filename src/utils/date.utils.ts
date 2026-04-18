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

/**
 * Retorna o objeto Date representando o final do dia (23:59:59.999) no fuso de Brasília.
 */
export const getEndOfDayBR = (date?: Date | string): Date => {
  const d = date ? parseLocalDate(date) : getNowBR();
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Retorna o objeto Date representando o início do dia (00:00:00.000) no fuso de Brasília.
 */
export const getStartOfDayBR = (date?: Date | string): Date => {
  const d = date ? parseLocalDate(date) : getNowBR();
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Formata um objeto Date (ou string) como YYYY-MM-DD para persistência no banco (colunas DATE).
 * ESSENCIAL para evitar o bug de pular um dia ao usar .toISOString() perto da meia-noite.
 */
export const toPersistenceString = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Alias para compatibilidade legada.
 */
export const toLocalDateString = (date: Date | string): string => {
  return toPersistenceString(date);
};

/**
 * Formata para DD/MM/YYYY HH:mm.
 */
export const formatDateTime = (date: string | Date): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(d);
};

/**
 * Formata para DD/MM/YYYY.
 */
export const formatToBrazilianDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseLocalDate(date) : date;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
};

export const getMonthNameBR = (monthNumber?: number): string => {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return "";
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return names[monthNumber - 1];
};

export const getLastDayOfMonth = (year: number, month: number): number => {
  return new Date(year, month, 0).getDate();
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
