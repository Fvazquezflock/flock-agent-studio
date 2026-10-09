const UNSUPPORTED_KEYWORDS = ['default', 'minLength', 'maxLength', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'minItems', 'maxItems', 'pattern', 'format', '$schema', 'propertyNames'];

type Schema = Record<string, unknown>;

/** Objeto de forma libre (z.record): sin `properties`, con claves arbitrarias. */
function isFreeFormObject(s: unknown): boolean {
  return !!s && typeof s === 'object' && !Array.isArray(s) && (s as Schema).type === 'object' && !(s as Schema).properties;
}

const FREE_FORM_NOTE = 'Objeto JSON serializado como texto.';

/**
 * Adapta un JSON Schema al subconjunto de salidas estructuradas (objetos cerrados, sin restricciones numéricas).
 * Lo usan la API y el runner local: verificado con Claude Code 2.1.128 que, con el esquema crudo de Zod
 * (`$schema` draft 2020-12 y `default`), `--json-schema` se ignora y la respuesta llega como texto libre.
 * Los objetos de forma libre (p. ej. la `definition` de una propuesta o el `input` del plan) no se pueden
 * expresar con objetos cerrados: se piden como texto JSON y `reviveStructuredOutput` los vuelve a convertir.
 */
export function toStructuredSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toStructuredSchema);
  if (!schema || typeof schema !== 'object') return schema;
  if (isFreeFormObject(schema)) {
    const description = (schema as Schema).description;
    const desc = typeof description === 'string' ? `${description} ` : '';
    return { type: 'string', description: `${desc}${FREE_FORM_NOTE}` };
  }
  const out: Schema = {};
  for (const [k, v] of Object.entries(schema as Schema)) {
    if (UNSUPPORTED_KEYWORDS.includes(k)) continue;
    out[k] = k === 'properties' && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([pk, pv]) => [pk, toStructuredSchema(pv)])) : toStructuredSchema(v);
  }
  if (out.type === 'object') out.additionalProperties = false;
  return out;
}

function parseObject(value: string): unknown {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : value;
  } catch {
    return value; // queda como texto: la validación del contrato lo rechaza con un error claro
  }
}

/**
 * Inverso de `toStructuredSchema` sobre la respuesta: donde el esquema original espera un objeto de forma libre
 * y llegó texto, lo interpreta como JSON. Lo demás no se toca (el proveedor simulado devuelve objetos).
 */
export function reviveStructuredOutput(schema: unknown, value: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return value;
  const s = schema as Schema;
  if (isFreeFormObject(s)) return typeof value === 'string' ? parseObject(value) : value;
  if (Array.isArray(s.anyOf)) {
    const branches = s.anyOf as unknown[];
    if (typeof value === 'string' && branches.some(isFreeFormObject)) return parseObject(value);
    const objectBranch = branches.find((b) => (b as Schema)?.type === 'object' && (b as Schema).properties);
    if (objectBranch && value && typeof value === 'object' && !Array.isArray(value)) return reviveStructuredOutput(objectBranch, value);
    const arrayBranch = branches.find((b) => (b as Schema)?.type === 'array');
    if (arrayBranch && Array.isArray(value)) return reviveStructuredOutput(arrayBranch, value);
    return value;
  }
  if (s.type === 'object' && s.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [k, sub] of Object.entries(s.properties as Schema)) if (k in out) out[k] = reviveStructuredOutput(sub, out[k]);
    return out;
  }
  if (s.type === 'array' && s.items && Array.isArray(value)) return value.map((v) => reviveStructuredOutput(s.items, v));
  return value;
}
