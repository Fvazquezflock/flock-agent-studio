import { createHash, randomUUID } from 'node:crypto';

/** JSON con claves ordenadas: mismo contenido => mismo hash, sin importar el orden de las claves. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function contentHash(value: unknown): string {
  return sha256(stableStringify(value));
}

export function newCorrelationId(): string {
  return randomUUID();
}
