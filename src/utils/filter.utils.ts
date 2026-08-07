/**
 * Retorna true se o valor de filtro for uma string válida (não nula, não vazia
 * e não for uma palavra reservada de filtro sentinela como 'all', 'todos', 'todas', 'none', 'null', 'undefined').
 */
export function isValidFilterValue(val: unknown): val is string {
  if (val === null || val === undefined) return false;
  if (typeof val !== "string") return false;
  const trimmed = val.trim();
  if (trimmed === "") return false;
  const lower = trimmed.toLowerCase();
  const sentinels = ["all", "todos", "todas", "none", "null", "undefined"];
  return !sentinels.includes(lower);
}
