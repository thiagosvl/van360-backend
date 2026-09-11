export interface AlteracaoAuditoria {
  campo: string;
  de: unknown;
  para: unknown;
}

export interface AuditDiffResult {
  alteracoes: AlteracaoAuditoria[];
  campos: string[];
  hasChanges: boolean;
}

const DEFAULT_IGNORED_KEYS = new Set([
  "id",
  "usuario_id",
  "created_at",
  "updated_at",
  "senha",
  "password",
  "pin_hash",
  "token_acesso",
  "conta_pai_id",
]);

function normalizeValue(val: unknown): unknown {
  if (val === undefined || val === null || val === "") {
    return null;
  }

  if (typeof val === "number") {
    return Number.isFinite(val) ? val : null;
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return null;

    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isNaN(num) && String(num) === trimmed) {
        return num;
      }
    }

    if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?Z?)?$/.test(trimmed)) {
      const parsed = Date.parse(trimmed);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }

    return trimmed;
  }

  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val.toISOString();
  }

  if (Array.isArray(val) || typeof val === "object") {
    return JSON.stringify(val);
  }

  return val;
}

function areValuesEqual(a: unknown, b: unknown): boolean {
  const normA = normalizeValue(a);
  const normB = normalizeValue(b);

  if (normA === null && normB === null) {
    return true;
  }

  return normA === normB;
}

export function calculateAuditDiff<
  TOriginal extends object = Record<string, unknown>,
  TUpdates extends object = Record<string, unknown>
>(
  original: TOriginal | null | undefined,
  updates: TUpdates | null | undefined,
  extraIgnoredKeys: string[] = []
): AuditDiffResult {
  if (!original || !updates) {
    return { alteracoes: [], campos: [], hasChanges: false };
  }

  const origRecord = original as Record<string, unknown>;
  const updRecord = updates as Record<string, unknown>;

  const ignored = new Set([...DEFAULT_IGNORED_KEYS, ...extraIgnoredKeys]);
  const alteracoes: AlteracaoAuditoria[] = [];
  const campos: string[] = [];

  for (const [key, newValue] of Object.entries(updRecord)) {
    if (ignored.has(key)) {
      continue;
    }

    const oldValue = origRecord[key];

    if (!areValuesEqual(oldValue, newValue)) {
      alteracoes.push({
        campo: key,
        de: oldValue ?? null,
        para: newValue ?? null,
      });
      campos.push(key);
    }
  }

  return {
    alteracoes,
    campos,
    hasChanges: alteracoes.length > 0,
  };
}
