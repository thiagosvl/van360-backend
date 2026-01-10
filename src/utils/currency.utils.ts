export const moneyToNumber = (value: string | number): number => {
  if (typeof value === 'number') return value;
  if (!value) return 0;
  
  const numericString = value
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
    
  return parseFloat(numericString) || 0;
};
