export interface PaginationInput {
  page?: number | string | null;
  limit?: number | string | null;
  defaultLimit?: number;
  maxLimit?: number;
}

export interface PaginationResult {
  page: number;
  limit: number;
  from: number;
  to: number;
  offset: number;
}

export interface PaginatedMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function calculatePaginationParams(input: PaginationInput = {}): PaginationResult {
  const defaultLimit = input.defaultLimit || 20;
  const maxLimit = input.maxLimit || 100;

  let page = typeof input.page === "string" ? parseInt(input.page, 10) : (input.page || 1);
  if (isNaN(page) || page < 1) page = 1;

  let limit = typeof input.limit === "string" ? parseInt(input.limit, 10) : (input.limit || defaultLimit);
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;
  const from = offset;
  const to = offset + limit - 1;

  return { page, limit, from, to, offset };
}

export function formatPaginatedMeta(total: number, page: number, limit: number): PaginatedMeta {
  const validTotal = Math.max(0, total || 0);
  const totalPages = limit > 0 ? Math.ceil(validTotal / limit) : 0;
  return {
    page,
    limit,
    total: validTotal,
    totalPages,
  };
}

export function sanitizeSqlSearch(searchStr?: string | null): string {
  if (!searchStr) return "";
  return searchStr
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/'/g, "''")
    .replace(/[\x00\n\r\x1a]/g, "")
    .trim();
}

export function buildSafeIlikeFilter(column: string, searchTerm: string): string {
  const sanitized = sanitizeSqlSearch(searchTerm);
  return `${column}.ilike.%${sanitized}%`;
}
