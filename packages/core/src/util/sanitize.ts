const SECRET_KEY = /(token|password|passwd|secret|api[_-]?key|authorization|cookie|credential)/i;
const SECRET_VALUE = /(sk-ant-[A-Za-z0-9_-]{10,}|ATATT[A-Za-z0-9_-]{10,}|Bearer\s+[A-Za-z0-9._-]{12,})/g;

/** Redacta secretos de cualquier estructura antes de registrarla (auditoría, eventos, logs). */
export function sanitize<T>(value: T, depth = 0): T {
  if (depth > 12) return '[profundidad máxima]' as unknown as T;
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTADO]') as unknown as T;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1)) as unknown as T;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) && v !== null && v !== undefined && v !== '' ? '[REDACTADO]' : sanitize(v, depth + 1);
    }
    return out as T;
  }
  return value;
}

/** Recorta textos largos para eventos y vistas resumidas. */
export function truncate(text: string, max = 400): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
