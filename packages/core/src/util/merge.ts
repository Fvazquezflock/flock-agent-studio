type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** Merge profundo: los objetos se combinan, los arrays y escalares del override reemplazan. */
export function deepMerge<T>(base: T, override: unknown): T {
  if (!isObj(base) || !isObj(override)) return (override === undefined ? base : (override as T));
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v === undefined) continue;
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v;
  }
  return out as T;
}

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Obj)[part] : undefined), obj);
}
