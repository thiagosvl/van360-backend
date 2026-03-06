export const toLocalDateString = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Converte para a data correta em São Paulo independente do fuso do servidor
  const spDate = new Date(d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  const year = spDate.getFullYear();
  const month = (spDate.getMonth() + 1).toString().padStart(2, '0');
  const day = spDate.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/**
 * Formata uma data (Date ou string YYYY-MM-DD) para o formato brasileiro DD/MM/YYYY.
 */
export const formatToBrazilianDate = (date: Date | string): string => {
  const dateStr = toLocalDateString(date);
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;

  return `${day}/${month}/${year}`;
};

/**
 * Retorna o nome do mês em português a partir do número (1-12).
 */
export const getMonthNameBR = (monthNumber?: number): string => {
  if (!monthNumber || monthNumber < 1 || monthNumber > 12) return "";
  const names = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  return names[monthNumber - 1];
};
