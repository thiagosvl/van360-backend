import { Encodings } from '@pdf-lib/standard-fonts';

export function sanitizePdfText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') return '';

  const sanitized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’‹›`]/g, "'")
    .replace(/[—–−‐‑]/g, '-')
    .replace(/[✔✓]/g, '[X]')
    .replace(/[✖✗✕]/g, '[ ]')
    .replace(/[•●▪]/g, '-')
    .split('\n')
    .map((line) => line.replace(/[^\S\r\n]+/g, ' ').trim())
    .join('\n');

  const winAnsi = Encodings.WinAnsi;
  let result = '';

  for (const char of sanitized) {
    if (char === '\n') {
      result += '\n';
      continue;
    }
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && winAnsi.canEncodeUnicodeCodePoint(codePoint)) {
      result += char;
    }
  }

  return result;
}

export function sanitizeContractConfig<T extends Record<string, unknown> | null | undefined>(config: T): T {
  if (!config || typeof config !== 'object') return config;
  const cloned = { ...config } as Record<string, unknown>;

  if (Array.isArray(cloned.clausulas)) {
    cloned.clausulas = cloned.clausulas
      .map((c) => (typeof c === 'string' ? sanitizePdfText(c) : c))
      .filter((c) => typeof c !== 'string' || c.trim() !== '');
  }

  if (Array.isArray(cloned.secoes)) {
    cloned.secoes = cloned.secoes.map((sec) => {
      if (!sec || typeof sec !== 'object') return sec;
      const secObj = { ...(sec as Record<string, unknown>) };
      if (typeof secObj.titulo === 'string') {
        secObj.titulo = sanitizePdfText(secObj.titulo);
      }
      if (Array.isArray(secObj.clausulas)) {
        secObj.clausulas = secObj.clausulas
          .map((c) => (typeof c === 'string' ? sanitizePdfText(c) : c))
          .filter((c) => typeof c !== 'string' || c.trim() !== '');
      }
      return secObj;
    });
  }

  return cloned as T;
}

