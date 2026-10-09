import { agentDefinitionSchema, orchestratorDefinitionSchema, skillDefinitionSchema } from '@mao/shared';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { contentHash } from '../util/hash';
import type { CatalogKind } from './validation';

/**
 * Formato de archivos del catálogo (fuente de verdad versionada en el repo, carpeta `catalog/`):
 * - agentes:       `agents/<Clave>.md`          frontmatter YAML + prompt de sistema en el cuerpo
 * - skills:        `skills/<Clave>/SKILL.md`    frontmatter YAML + instrucciones en el cuerpo (estilo Claude Code)
 * - orquestadores: `orchestrators/<CLAVE>.yaml` definición completa en YAML
 *
 * El render es sin pérdida: `parseCatalogFile(renderCatalogFile(def))` normaliza al mismo hash que `def`.
 * Solo se omiten valores vacíos ('' / [] / {}) cuando quitarlos no cambia la definición normalizada.
 */

export const CATALOG_KINDS: readonly CatalogKind[] = ['skill', 'agent', 'orchestrator'];

export const CATALOG_KEY_RE = /^[A-Za-z][A-Za-z0-9_-]{1,63}$/;

const SCHEMAS = { agent: agentDefinitionSchema, skill: skillDefinitionSchema, orchestrator: orchestratorDefinitionSchema } as const;

/** Campo que va en el cuerpo Markdown (no en el frontmatter). */
const BODY_FIELD: Record<CatalogKind, 'systemPrompt' | 'instructions' | null> = { agent: 'systemPrompt', skill: 'instructions', orchestrator: null };

const HEADER: Record<CatalogKind, string[]> = {
  agent: [
    'Agente del catálogo. El cuerpo (debajo del segundo ---) es el prompt de sistema.',
    'Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.',
  ],
  skill: [
    'Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.',
    'Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.',
  ],
  orchestrator: [
    'Orquestador del catálogo (flujo declarativo).',
    'Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.',
  ],
};

export class CatalogFileError extends Error {
  constructor(
    message: string,
    readonly errors: string[] = [message],
  ) {
    super(message);
    this.name = 'CatalogFileError';
  }
}

/** Ruta relativa a la carpeta del catálogo. */
export function catalogRelPath(kind: CatalogKind, key: string): string {
  if (kind === 'agent') return `agents/${key}.md`;
  if (kind === 'skill') return `skills/${key}/SKILL.md`;
  return `orchestrators/${key}.yaml`;
}

/** Fin de línea LF, sin BOM. */
export function normalizeText(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

function normalizeStrings(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(/\r\n?/g, '\n');
  if (Array.isArray(value)) return value.map(normalizeStrings);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeStrings(v)]));
  return value;
}

/**
 * Definición normalizada: esquema Zod (con valores por defecto), fines de línea LF y cuerpo sin espacios en los extremos.
 * Lanza CatalogFileError si no cumple el esquema.
 */
export function normalizeDefinition(kind: CatalogKind, raw: unknown): Record<string, unknown> {
  const parsed = SCHEMAS[kind].safeParse(normalizeStrings(raw));
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);
    throw new CatalogFileError(`Definición inválida: ${errors.join('; ')}`, errors);
  }
  const def = parsed.data as Record<string, unknown>;
  const body = BODY_FIELD[kind];
  if (body && typeof def[body] === 'string') def[body] = (def[body] as string).trim();
  return def;
}

/** Hash comparable entre archivo y base: mismo contenido normalizado => mismo hash. */
export function definitionHash(kind: CatalogKind, raw: unknown): string {
  return contentHash(normalizeDefinition(kind, raw));
}

/** Igual que definitionHash pero devuelve null si la definición no cumple el esquema. */
export function safeDefinitionHash(kind: CatalogKind, raw: unknown): string | null {
  try {
    return definitionHash(kind, raw);
  } catch {
    return null;
  }
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isEmpty = (v: unknown) => v === '' || (Array.isArray(v) && v.length === 0) || (isPlainObject(v) && Object.keys(v).length === 0);

/** Quita valores vacíos solo si la definición normalizada no cambia (sin pérdida aunque un valor por defecto no sea vacío). */
function pruneEmpty(kind: CatalogKind, def: Record<string, unknown>): Record<string, unknown> {
  const target = definitionHash(kind, def);
  const root = structuredClone(def);
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isPlainObject(node)) return;
    for (const k of Object.keys(node)) {
      visit(node[k]);
      if (!isEmpty(node[k])) continue;
      const saved = node[k];
      delete node[k];
      if (safeDefinitionHash(kind, root) !== target) node[k] = saved;
    }
  };
  visit(root);
  return root;
}

function toYaml(value: unknown): string {
  return stringifyYaml(value, { lineWidth: 0, blockQuote: 'literal' });
}

function header(kind: CatalogKind): string {
  return HEADER[kind].map((l) => `# ${l}`).join('\n') + '\n';
}

/** Texto del archivo para una definición (se normaliza antes de escribir). */
export function renderCatalogFile(kind: CatalogKind, definition: unknown): string {
  const def = pruneEmpty(kind, normalizeDefinition(kind, definition));
  const body = BODY_FIELD[kind];
  if (!body) return header(kind) + toYaml(def);
  const { [body]: text, ...front } = def;
  return `---\n${header(kind)}${toYaml(front)}---\n\n${String(text ?? '')}\n`;
}

function parseYamlText(text: string, what: string): unknown {
  try {
    return parseYaml(text, { prettyErrors: true, uniqueKeys: true });
  } catch (err) {
    throw new CatalogFileError(`YAML inválido en ${what}: ${err instanceof Error ? err.message.split('\n')[0] : String(err)}`);
  }
}

/**
 * Lee el texto de un archivo del catálogo y devuelve la definición cruda (sin validar contra el esquema).
 * Lanza CatalogFileError si el formato es inválido.
 */
export function parseCatalogFile(kind: CatalogKind, text: string): Record<string, unknown> {
  const src = normalizeText(text);
  const body = BODY_FIELD[kind];
  if (!body) {
    const value = parseYamlText(src, 'el orquestador');
    if (!isPlainObject(value)) throw new CatalogFileError('El archivo del orquestador debe ser un objeto YAML');
    return value;
  }
  if (!src.startsWith('---\n')) throw new CatalogFileError('Falta el frontmatter: el archivo debe empezar con una línea ---');
  const end = src.indexOf('\n---', 3);
  if (end < 0) throw new CatalogFileError('Falta la línea --- que cierra el frontmatter');
  const afterMarker = src.slice(end + 4);
  if (afterMarker && !afterMarker.startsWith('\n')) throw new CatalogFileError('La línea que cierra el frontmatter debe ser exactamente ---');
  const front = parseYamlText(src.slice(4, end + 1), 'el frontmatter');
  if (front !== null && front !== undefined && !isPlainObject(front)) throw new CatalogFileError('El frontmatter debe ser un objeto YAML');
  const fm = (front ?? {}) as Record<string, unknown>;
  if (body in fm) throw new CatalogFileError(`"${body}" va en el cuerpo del archivo, no en el frontmatter`);
  return { ...fm, [body]: afterMarker.replace(/^\n/, '') };
}

/** Configuración (proyectos, políticas, conexiones, proveedores, global) en YAML, con un encabezado comentado opcional. */
export function renderYaml(value: unknown, headerLines: string[] = []): string {
  return headerLines.map((l) => `# ${l}\n`).join('') + toYaml(value);
}

export function parseYamlFile(text: string, what = 'el archivo'): unknown {
  return parseYamlText(normalizeText(text), what);
}
