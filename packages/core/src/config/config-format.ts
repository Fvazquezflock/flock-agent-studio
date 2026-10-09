import { APPROVAL_MODES, ENTITY_STATUSES, OPERATION_TYPES, PROVIDER_KINDS, globalConfigSchema, projectConfigSchema, projectCreateRequest, type GlobalConfig, type ProjectConfig } from '@mao/shared';
import { z } from 'zod';
import { CatalogFileError } from '../catalog/file-format';
import { contentHash, stableStringify } from '../util/hash';
import { sanitize } from '../util/sanitize';

/**
 * Formato de los archivos de configuración de `catalog/` (funciones puras, sin base ni disco).
 * Cada archivo se compara por su contenido NORMALIZADO (esquemas Zod con valores por defecto + orden estable):
 * el formato, los comentarios o el orden de las claves no cuentan como cambios.
 */

export type ConfigSubject = 'global' | 'policies' | 'connections' | 'providers' | 'project';

export const GLOBAL_FILE = 'global.yaml';
export const POLICIES_FILE = 'policies.yaml';
export const CONNECTIONS_FILE = 'connections.yaml';
export const PROVIDERS_FILE = 'providers.yaml';
export const PROJECTS_DIR = 'projects';
export const projectFileRelPath = (key: string) => `${PROJECTS_DIR}/${key}.yaml`;

const COMMON_HEADER = [
  'La plataforma exporta este archivo desde la base en cada cambio (sin secretos).',
  'Los cambios manuales o traídos con git pull no se aplican solos: aplicalos con `pnpm mao files apply` o desde la UI (página Archivos).',
];

export function configFileHeader(subject: ConfigSubject, key?: string): string[] {
  const first: Record<ConfigSubject, string> = {
    global: 'Configuración global de la plataforma (límites, seguridad y valores por defecto de los proyectos).',
    policies: 'Políticas de aprobación activas (sin las de proyectos en modo DEMO).',
    connections: 'Conexiones MCP. Las credenciales viven en el archivo envFile (dentro de MCP/, no se versiona).',
    providers: 'Proveedores de IA, sin claves: solo el nombre de la variable de entorno (apiKeyEnv).',
    project: `Proyecto ${key ?? ''}: metadatos y configuración activa.`,
  };
  return [first[subject], ...COMMON_HEADER];
}

// ---------- Utilidades ----------

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

function formatPath(path: readonly PropertyKey[]): string {
  let out = '';
  for (const p of path) out += typeof p === 'number' ? `[${p}]` : out ? `.${String(p)}` : String(p);
  return out || '(raíz)';
}

function zodErrors(err: z.ZodError, prefix: PropertyKey[] = []): string[] {
  return err.issues.map((i) => `${formatPath([...prefix, ...i.path])}: ${i.message}`);
}

function parseWith<S extends z.ZodTypeAny>(schema: S, raw: unknown, what: string, prefix: PropertyKey[] = []): z.infer<S> {
  const r = schema.safeParse(raw);
  if (!r.success) {
    const errors = zodErrors(r.error, prefix);
    throw new CatalogFileError(`${what} inválido: ${errors.join('; ')}`, errors);
  }
  return r.data;
}

function requireObject(raw: unknown, what: string): Record<string, unknown> {
  if (!isPlainObject(raw)) throw new CatalogFileError(`${what}: el archivo debe ser un objeto YAML`);
  return raw;
}

/**
 * Claves del YAML que el esquema descartó (los esquemas compartidos no son estrictos): un error de tipeo como
 * `technologys:` se reporta en lugar de ignorarse en silencio.
 */
export function unknownKeys(raw: unknown, parsed: unknown, prefix = ''): string[] {
  if (Array.isArray(raw) && Array.isArray(parsed)) return raw.flatMap((r, i) => unknownKeys(r, parsed[i], `${prefix}[${i}]`));
  if (!isPlainObject(raw) || !isPlainObject(parsed)) return [];
  return Object.keys(raw).flatMap((k) => {
    const p = prefix ? `${prefix}.${k}` : k;
    return k in parsed ? unknownKeys(raw[k], parsed[k], p) : [p];
  });
}

function rejectUnknownKeys(raw: unknown, parsed: unknown, what: string, prefix = '') {
  const unknown = unknownKeys(raw, parsed, prefix);
  if (unknown.length) {
    const errors = unknown.map((k) => `${k}: clave desconocida`);
    throw new CatalogFileError(`${what} inválido: ${errors.join('; ')}`, errors);
  }
}

const dropUndefined = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- Secretos en la configuración de proveedores ----------

/** Claves con forma de credencial: nunca se guardan (ni en la base ni en archivos). */
const SECRET_CONFIG_KEY = /key$|token|secret|password/i;
/** Excepciones: el nombre de la variable de entorno con la clave y el límite numérico de tokens. */
const NOT_SECRET_KEYS = new Set(['apiKeyEnv', 'maxTokens']);
export const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/;

/**
 * Claves de la configuración de un proveedor que no se pueden guardar: con forma de credencial, `apiKeyEnv` que no es
 * un nombre de variable de entorno (p. ej. la clave pegada por error) o valores con forma de secreto.
 */
export function secretConfigKeys(config: Record<string, unknown>): string[] {
  return Object.entries(config)
    .filter(([k, v]) => {
      if (k === 'apiKeyEnv') return typeof v !== 'string' || !ENV_VAR_NAME_RE.test(v);
      if (!NOT_SECRET_KEYS.has(k) && SECRET_CONFIG_KEY.test(k)) return true;
      return stableStringify(sanitize(v)) !== stableStringify(v);
    })
    .map(([k]) => k);
}

export function withoutSecretConfig(config: Record<string, unknown>): Record<string, unknown> {
  const bad = new Set(secretConfigKeys(config));
  return Object.fromEntries(Object.entries(config).filter(([k]) => !bad.has(k)));
}

// ---------- global.yaml ----------

export function normalizeGlobalFile(raw: unknown): GlobalConfig {
  requireObject(raw, GLOBAL_FILE);
  const parsed = parseWith(globalConfigSchema, raw, 'Configuración global');
  rejectUnknownKeys(raw, parsed, 'Configuración global');
  return parsed;
}

export const globalFromDb = (value: unknown): GlobalConfig => parseWith(globalConfigSchema, value ?? {}, 'Configuración global de la base');

// ---------- policies.yaml ----------

const policyEntrySchema = z
  .strictObject({
    scope: z.enum(['GLOBAL', 'PROJECT']),
    /** Clave del proyecto (solo scope PROJECT). */
    project: z.string().min(1).optional(),
    /** Clave del orquestador (opcional): política de operación. */
    orchestrator: z.string().min(1).optional(),
    operation: z.enum(OPERATION_TYPES),
    mode: z.enum(APPROVAL_MODES),
    mandatory: z.boolean().default(false),
    description: z.string().max(2000).default(''),
    rules: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((p, ctx) => {
    if (p.scope === 'PROJECT' && !p.project) ctx.addIssue({ code: 'custom', path: ['project'], message: 'Las políticas de proyecto requieren project (clave del proyecto)' });
    if (p.scope === 'GLOBAL' && p.project) ctx.addIssue({ code: 'custom', path: ['project'], message: 'Las políticas globales no llevan project' });
  });

export type PolicyFileEntry = z.infer<typeof policyEntrySchema>;
export interface PoliciesFile {
  policies: PolicyFileEntry[];
}

const policiesFileSchema = z.strictObject({ policies: z.array(policyEntrySchema).default([]) });

/** Identidad de una política: ámbito + proyecto + orquestador + operación (una sola activa por identidad). */
export const policyIdentity = (p: { scope: string; project?: string | null; orchestrator?: string | null; operation: string }) => [p.scope, p.project ?? '', p.orchestrator ?? '', p.operation].join('|');

export const policyLabel = (p: PolicyFileEntry) => `${p.operation} (${p.scope}${p.project ? ' ' + p.project : ''}${p.orchestrator ? ' / ' + p.orchestrator : ''})`;

function sortPolicies(list: PolicyFileEntry[]): PolicyFileEntry[] {
  const opIndex = (op: string) => (OPERATION_TYPES as readonly string[]).indexOf(op);
  return [...list].sort((a, b) => cmp(a.scope, b.scope) || cmp(a.project ?? '', b.project ?? '') || cmp(a.orchestrator ?? '', b.orchestrator ?? '') || cmp(opIndex(a.operation), opIndex(b.operation)));
}

export function normalizePoliciesFile(raw: unknown): PoliciesFile {
  requireObject(raw, POLICIES_FILE);
  const parsed = parseWith(policiesFileSchema, raw, 'Archivo de políticas');
  const seen = new Map<string, number>();
  const errors: string[] = [];
  parsed.policies.forEach((p, i) => {
    const id = policyIdentity(p);
    if (seen.has(id)) errors.push(`policies[${i}]: repite la política de policies[${seen.get(id)}] (${policyLabel(p)})`);
    else seen.set(id, i);
  });
  if (errors.length) throw new CatalogFileError(`Archivo de políticas inválido: ${errors.join('; ')}`, errors);
  return { policies: sortPolicies(parsed.policies.map(dropUndefined)) };
}

export interface PolicyRow {
  scope: string;
  projectId: string | null;
  orchestratorKey: string | null;
  operationType: string;
  mode: string;
  mandatory: boolean;
  description: string;
  rules: unknown;
  version: number;
}

/** Políticas activas de la base en formato de archivo: la última versión por identidad, sin proyectos en modo DEMO. */
export function policiesFromDb(rows: PolicyRow[], projects: Map<string, { key: string; mode: string }>): PoliciesFile {
  const latest = new Map<string, { row: PolicyRow; entry: PolicyFileEntry }>();
  for (const row of rows) {
    const project = row.projectId ? projects.get(row.projectId) : undefined;
    if (row.scope === 'PROJECT' && (!project || project.mode === 'DEMO')) continue;
    const entry = parseWith(
      policyEntrySchema,
      dropUndefined({
        scope: row.scope,
        project: row.scope === 'PROJECT' ? project?.key : undefined,
        orchestrator: row.orchestratorKey ?? undefined,
        operation: row.operationType,
        mode: row.mode,
        mandatory: row.mandatory,
        description: row.description ?? '',
        rules: isPlainObject(row.rules) ? row.rules : {},
      }),
      'Política de la base',
    );
    const id = policyIdentity(entry);
    const prev = latest.get(id);
    if (!prev || row.version > prev.row.version) latest.set(id, { row, entry: dropUndefined(entry) });
  }
  return { policies: sortPolicies([...latest.values()].map((x) => x.entry)) };
}

// ---------- connections.yaml ----------

const connectionEntrySchema = z.strictObject({
  key: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  kind: z.enum(['MCP_STDIO', 'MCP_HTTP']).default('MCP_STDIO'),
  purpose: z.string().min(1).default('JIRA'),
  /** Archivo de credenciales (valor de --env-file), relativo al repo y dentro de MCP/. */
  envFile: z.string().min(1).max(200).optional(),
});
export type ConnectionFileEntry = z.infer<typeof connectionEntrySchema>;
export interface ConnectionsFile {
  connections: ConnectionFileEntry[];
}

const connectionsFileSchema = z.strictObject({ connections: z.array(connectionEntrySchema).default([]) });

function rejectDuplicateKeys(list: { key: string }[], field: string, what: string) {
  const seen = new Map<string, number>();
  const errors: string[] = [];
  list.forEach((x, i) => {
    if (seen.has(x.key)) errors.push(`${field}[${i}].key: repite la clave ${x.key} de ${field}[${seen.get(x.key)}]`);
    else seen.set(x.key, i);
  });
  if (errors.length) throw new CatalogFileError(`${what} inválido: ${errors.join('; ')}`, errors);
}

export function normalizeConnectionsFile(raw: unknown): ConnectionsFile {
  requireObject(raw, CONNECTIONS_FILE);
  const parsed = parseWith(connectionsFileSchema, raw, 'Archivo de conexiones');
  rejectDuplicateKeys(parsed.connections, 'connections', 'Archivo de conexiones');
  return { connections: parsed.connections.map(dropUndefined).sort((a, b) => cmp(a.key, b.key)) };
}

/** Valor de `--env-file` en los argumentos del servidor MCP (o `--env-file=...`). */
export function envFileFromArgs(args: unknown): string | undefined {
  if (!Array.isArray(args)) return undefined;
  const list = args.map(String);
  const i = list.indexOf('--env-file');
  if (i >= 0 && list[i + 1]) return list[i + 1];
  const eq = list.find((a) => a.startsWith('--env-file='));
  return eq ? eq.slice('--env-file='.length) || undefined : undefined;
}

export interface ConnectionRow {
  key: string;
  name: string;
  kind: string;
  purpose: string;
  config: unknown;
}

/** Conexiones de la base: nunca writeEnabled, estado, capacidades, errores ni el comando (se resuelve en cada máquina). */
export function connectionsFromDb(rows: ConnectionRow[]): ConnectionsFile {
  const list = rows.map((c) =>
    dropUndefined(
      parseWith(
        connectionEntrySchema,
        dropUndefined({ key: c.key, name: c.name, kind: c.kind, purpose: c.purpose, envFile: envFileFromArgs(isPlainObject(c.config) ? c.config.args : undefined) }),
        `Conexión ${c.key} de la base`,
      ),
    ),
  );
  return { connections: list.sort((a, b) => cmp(a.key, b.key)) };
}

// ---------- providers.yaml ----------

const providerEntrySchema = z
  .strictObject({
    key: z.string().min(1).max(64),
    name: z.string().min(1).max(120),
    kind: z.enum(PROVIDER_KINDS),
    enabled: z.boolean().default(true),
    isDefault: z.boolean().default(false),
    /** Modelo, binario, esfuerzo, nombre de la variable con la clave (apiKeyEnv). Nunca la clave. */
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((p, ctx) => {
    if (p.kind === 'MOCK') ctx.addIssue({ code: 'custom', path: ['kind'], message: 'El proveedor simulado (MOCK) no se guarda en archivos' });
    for (const k of secretConfigKeys(p.config)) {
      ctx.addIssue({
        code: 'custom',
        path: ['config', k],
        message: k === 'apiKeyEnv' ? 'apiKeyEnv debe ser el nombre de una variable de entorno (p. ej. ANTHROPIC_API_KEY), nunca la clave' : 'No se guardan secretos: usá apiKeyEnv con el nombre de la variable de entorno',
      });
    }
  });
export type ProviderFileEntry = z.infer<typeof providerEntrySchema>;
export interface ProvidersFile {
  providers: ProviderFileEntry[];
}

const providersFileSchema = z.strictObject({ providers: z.array(providerEntrySchema).default([]) });

export function normalizeProvidersFile(raw: unknown): ProvidersFile {
  requireObject(raw, PROVIDERS_FILE);
  const parsed = parseWith(providersFileSchema, raw, 'Archivo de proveedores');
  rejectDuplicateKeys(parsed.providers, 'providers', 'Archivo de proveedores');
  const defaults = parsed.providers.filter((p) => p.isDefault).map((p) => p.key);
  if (defaults.length > 1) throw new CatalogFileError(`Archivo de proveedores inválido: hay más de un proveedor por defecto (${defaults.join(', ')})`);
  return { providers: parsed.providers.sort((a, b) => cmp(a.key, b.key)) };
}

export interface ProviderRow {
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
  isDefault: boolean;
  config: unknown;
}

/** Proveedores de la base sin el simulado y sin claves con forma de secreto. */
export function providersFromDb(rows: ProviderRow[]): ProvidersFile {
  const list = rows
    .filter((p) => p.kind !== 'MOCK')
    .map((p) =>
      parseWith(
        providerEntrySchema,
        { key: p.key, name: p.name, kind: p.kind, enabled: p.enabled, isDefault: p.isDefault, config: withoutSecretConfig(isPlainObject(p.config) ? p.config : {}) },
        `Proveedor ${p.key} de la base`,
      ),
    );
  return { providers: list.sort((a, b) => cmp(a.key, b.key)) };
}

// ---------- projects/<CLAVE>.yaml ----------

const projectFileSchema = z
  .strictObject({
    name: z.string().min(1).max(120),
    description: z.string().max(2000).default(''),
    jiraProjectKey: z.string().min(1).max(20),
    mode: z.enum(['DEMO', 'JIRA']).default('JIRA'),
    status: z.enum(ENTITY_STATUSES).default('ACTIVE'),
    /** Clave de la conexión (obligatoria en modo JIRA). */
    connection: z.string().min(1).optional(),
    /** Clave del proveedor por defecto (opcional). */
    provider: z.string().min(1).optional(),
    config: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((p, ctx) => {
    if (p.mode === 'DEMO') ctx.addIssue({ code: 'custom', path: ['mode'], message: 'Los proyectos en modo DEMO no se guardan en archivos' });
  });

export interface ProjectFile {
  name: string;
  description: string;
  jiraProjectKey: string;
  mode: 'DEMO' | 'JIRA';
  status: (typeof ENTITY_STATUSES)[number];
  connection?: string;
  provider?: string;
  config: ProjectConfig;
}

export const isValidProjectKey = (key: string) => projectCreateRequest.shape.key.safeParse(key).success;

export function normalizeProjectFile(raw: unknown, key?: string): ProjectFile {
  if (key !== undefined && !isValidProjectKey(key)) {
    throw new CatalogFileError(`Clave de proyecto inválida "${key}": el nombre del archivo debe ser la clave (mayúsculas, números o "_", 2 a 20 caracteres)`);
  }
  requireObject(raw, key ? projectFileRelPath(key) : 'Proyecto');
  const parsed = parseWith(projectFileSchema, raw, 'Proyecto');
  const config = parseWith(projectConfigSchema, parsed.config, 'Proyecto', ['config']);
  rejectUnknownKeys(parsed.config, config, 'Proyecto', 'config');
  return dropUndefined({ ...parsed, config });
}

export interface ProjectRow {
  name: string;
  description: string;
  jiraProjectKey: string;
  mode: string;
  status: string;
  connection?: { key: string } | null;
  defaultProvider?: { key: string } | null;
}

export function projectFromDb(p: ProjectRow, config: unknown): ProjectFile {
  const meta = parseWith(
    projectFileSchema,
    dropUndefined({ name: p.name, description: p.description ?? '', jiraProjectKey: p.jiraProjectKey, mode: p.mode, status: p.status, connection: p.connection?.key, provider: p.defaultProvider?.key, config: {} }),
    'Proyecto de la base',
  );
  return dropUndefined({ ...meta, config: parseWith(projectConfigSchema, config ?? {}, 'Configuración del proyecto en la base', ['config']) });
}

// ---------- Render y hash ----------

/** Valor que se escribe en el YAML (omite `rules: {}` en las políticas). */
export function renderConfigValue(subject: ConfigSubject, normalized: unknown): unknown {
  if (subject === 'policies') {
    const v = normalized as PoliciesFile;
    return { policies: v.policies.map(({ rules, ...rest }) => (rules && Object.keys(rules).length ? { ...rest, rules } : rest)) };
  }
  return normalized;
}

export const configHash = (normalized: unknown) => contentHash(normalized);

/** Normaliza el contenido crudo de un archivo según su tipo. Lanza CatalogFileError. */
export function normalizeConfigFile(subject: ConfigSubject, raw: unknown, key?: string): unknown {
  switch (subject) {
    case 'global':
      return normalizeGlobalFile(raw);
    case 'policies':
      return normalizePoliciesFile(raw);
    case 'connections':
      return normalizeConnectionsFile(raw);
    case 'providers':
      return normalizeProvidersFile(raw);
    case 'project':
      return normalizeProjectFile(raw, key);
  }
}

// ---------- Registro de hashes exportados ----------

/** Hash normalizado de lo que la plataforma escribió o aplicó por archivo, con los anteriores (máximo HISTORY_MAX). */
export type ConfigFileRegistry = Record<string, { hash: string; history: string[] }>;
export const REGISTRY_HISTORY_MAX = 50;

export function parseRegistry(value: unknown): ConfigFileRegistry {
  const out: ConfigFileRegistry = {};
  if (!isPlainObject(value)) return out;
  for (const [rel, entry] of Object.entries(value)) {
    if (!isPlainObject(entry) || typeof entry.hash !== 'string') continue;
    out[rel] = { hash: entry.hash, history: Array.isArray(entry.history) ? entry.history.filter((h): h is string => typeof h === 'string') : [] };
  }
  return out;
}

export const isKnownHash = (registry: ConfigFileRegistry, relPath: string, hash: string) => {
  const e = registry[relPath];
  return !!e && (e.hash === hash || e.history.includes(hash));
};

/** Registra hashes como actuales (el anterior pasa al historial). Devuelve si cambió algo. */
export function registerHashes(registry: ConfigFileRegistry, entries: { relPath: string; hash: string }[], max = REGISTRY_HISTORY_MAX): boolean {
  let changed = false;
  for (const { relPath, hash } of entries) {
    const cur = registry[relPath];
    if (cur?.hash === hash) continue;
    const history = cur ? [cur.hash, ...cur.history].filter((h) => h !== hash).slice(0, max) : [];
    registry[relPath] = { hash, history };
    changed = true;
  }
  return changed;
}
