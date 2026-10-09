import { connectionCreateRequest, connectionUpdateRequest, type GlobalConfig } from '@mao/shared';
import type { Core } from '../core';
import type { Actor } from '../context';
import { CatalogFileError, parseYamlFile } from '../catalog/file-format';
import { normalizeEnvFile } from '../jira/connection-service';
import { checkPolicyChange, type PolicyRecord } from '../policies/policy-engine';
import { diffJson, type DiffLine } from '../util/diff';
import { PlatformError } from '../util/errors';
import { sanitize, truncate } from '../util/sanitize';
import { checkJiraFields, type ProjectUpdateInput } from './config-service';
import {
  CONNECTIONS_FILE,
  GLOBAL_FILE,
  POLICIES_FILE,
  PROJECTS_DIR,
  PROVIDERS_FILE,
  configFileHeader,
  configHash,
  connectionsFromDb,
  globalFromDb,
  isKnownHash,
  normalizeConfigFile,
  parseRegistry,
  policiesFromDb,
  policyIdentity,
  policyLabel,
  projectFileRelPath,
  projectFromDb,
  providersFromDb,
  registerHashes,
  renderConfigValue,
  type ConfigFileRegistry,
  type ConnectionsFile,
  type PoliciesFile,
  type ProjectFile,
  type ProvidersFile,
} from './config-format';

/**
 * Archivos de configuración en `catalog/` (sin secretos):
 * - `global.yaml`: configuración global (globalConfigSchema).
 * - `policies.yaml`: políticas de aprobación activas.
 * - `connections.yaml`: conexiones MCP (clave, nombre, tipo, propósito y archivo de credenciales; nunca `writeEnabled`, estado ni comando).
 * - `providers.yaml`: proveedores de IA (sin claves: solo el nombre de la variable de entorno). Sin el simulado.
 * - `projects/<CLAVE>.yaml`: metadatos del proyecto + configuración activa. Sin proyectos en modo DEMO.
 *
 * La base manda en el uso diario: cada cambio desde la UI, la CLI o una propuesta se exporta al archivo. Un archivo editado
 * a mano (o traído con git pull) no se aplica solo: queda CHANGED hasta que el propietario lo aplica explícitamente.
 */
export type ConfigFileSubject = 'global' | 'policies' | 'connections' | 'providers' | 'project';

/**
 * - IN_SYNC: el archivo refleja la base.
 * - MISSING_FILE: falta el archivo (se escribe al exportar).
 * - STALE_FILE: el archivo tiene un contenido que la plataforma ya exportó antes (versión vieja): se reescribe.
 * - CHANGED: contenido que la plataforma no escribió (edición manual o git pull): se aplica solo con `apply`.
 * - INVALID: no se puede leer o no valida.
 * Resultados: EXPORTED (se escribió), APPLIED (se aplicó a la base).
 */
export type ConfigFileState = 'IN_SYNC' | 'MISSING_FILE' | 'STALE_FILE' | 'CHANGED' | 'INVALID' | 'EXPORTED' | 'APPLIED';

export interface ConfigFileReport {
  subject: ConfigFileSubject;
  /** Clave del proyecto (solo subject = project). */
  key?: string;
  /** Relativa a la carpeta del catálogo (p. ej. `projects/SCRUM.yaml`). */
  relPath: string;
  state: ConfigFileState;
  message?: string;
  errors?: string[];
  /** Diferencias base → archivo (para CHANGED), con el formato de diffJson. */
  diff?: DiffLine[];
}

/**
 * Registro (GlobalSetting) con el hash normalizado de lo que la plataforma escribió o aplicó en cada archivo, y los
 * anteriores: distingue un archivo viejo (STALE_FILE, se reescribe) de uno editado a mano (CHANGED, no se pisa).
 * Es uno por base y por ruta relativa, no por carpeta: la base puede ser compartida por varios clones del repo y un
 * contenido que exportó cualquiera de ellos cuenta como conocido.
 */
const REGISTRY_KEY = 'catalog.files';
const GLOBAL_KEY = 'global.config';
const SEED_ACTOR: Actor = { type: 'SYSTEM', id: 'instalación inicial' };
const STATUS_ACTOR: Actor = { type: 'SYSTEM', id: 'archivos de configuración' };

type FileRead = { exists: false } | { exists: true; ok: true; value: unknown; hash: string } | { exists: true; ok: false; errors: string[] };

interface ScanItem {
  subject: ConfigFileSubject;
  key?: string;
  relPath: string;
  /** Contenido normalizado de la base; null si no corresponde archivo (proyecto inexistente o en modo DEMO). */
  db: unknown | null;
  dbHash: string | null;
  /** La base tiene un valor que no valida: no se exporta ni se aplica. */
  dbErrors?: string[];
  /** Proyecto en modo DEMO en la base. */
  demo?: boolean;
  file: FileRead;
  state: ConfigFileState;
  message?: string;
  errors?: string[];
  diff?: DiffLine[];
  /** Coincide con la base pero el hash no figura como actual en el registro. */
  register?: boolean;
}

/** Mensajes legibles de cualquier error (validaciones Zod incluidas). */
function errorList(err: unknown): string[] {
  if (err instanceof CatalogFileError) return err.errors;
  if (err instanceof PlatformError) {
    const issues = err.details?.issues;
    if (Array.isArray(issues) && issues.length) {
      return issues.map((i) => {
        if (typeof i === 'string') return `${err.message}: ${i}`;
        const issue = i as { path?: unknown[]; message?: string };
        return `${err.message}: ${(issue.path ?? []).join('.') || '(raíz)'}: ${issue.message ?? ''}`;
      });
    }
    return [err.message];
  }
  return [err instanceof Error ? err.message : String(err)];
}

const reportBase = (it: ScanItem): Pick<ConfigFileReport, 'subject' | 'key' | 'relPath'> => ({ subject: it.subject, ...(it.key ? { key: it.key } : {}), relPath: it.relPath });

function toReport(it: ScanItem): ConfigFileReport {
  return { ...reportBase(it), state: it.state, ...(it.message ? { message: it.message } : {}), ...(it.errors ? { errors: it.errors } : {}), ...(it.diff ? { diff: it.diff } : {}) };
}

function classify(it: Omit<ScanItem, 'state'>, registry: ConfigFileRegistry): ScanItem {
  if (it.dbErrors) return { ...it, state: 'INVALID', message: 'La configuración de la base no valida: no se exporta este archivo', errors: it.dbErrors };
  const f = it.file;
  if (!f.exists) return { ...it, state: 'MISSING_FILE', message: 'Falta el archivo: se escribe al exportar' };
  if (!f.ok) return { ...it, state: 'INVALID', message: 'El archivo no se puede leer o no valida', errors: f.errors };
  if (it.db !== null && f.hash === it.dbHash) return { ...it, state: 'IN_SYNC', register: registry[it.relPath]?.hash !== f.hash };
  if (isKnownHash(registry, it.relPath, f.hash)) {
    const message = it.db === null ? 'El proyecto ya no existe o está en modo DEMO: el archivo se borra al exportar' : 'Versión anterior exportada por la plataforma: se reescribe al exportar';
    return { ...it, state: 'STALE_FILE', message };
  }
  if (it.demo) return { ...it, state: 'INVALID', message: 'Proyecto en modo DEMO', errors: [`El proyecto ${it.key} está en modo DEMO: los proyectos DEMO no se administran desde archivos`] };
  const message = it.db !== null ? 'Cambios sin aplicar: aplicalos con `pnpm mao files apply` o desde la página Archivos' : 'Proyecto nuevo: se crea al aplicar el archivo';
  return { ...it, state: 'CHANGED', message, diff: diffJson(it.db === null ? {} : renderConfigValue(it.subject, it.db), renderConfigValue(it.subject, f.value)) };
}

/** `catalog/projects/X.yaml`, `.\projects\X.yaml` → `projects/X.yaml`. */
const normalizeRequestedPath = (p: string) => p.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^catalog\//, '');

export class ConfigFileService {
  /** Mientras se aplica o se siembra, los cambios no exportan uno por uno: se exporta una vez al final. */
  private suppressed = 0;

  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  private get store() {
    return this.core.catalogFiles;
  }

  /** Estado de todos los archivos de configuración sin escribir archivos (solo registra los hashes de los sincronizados). */
  async status(): Promise<ConfigFileReport[]> {
    const items = await this.scan();
    try {
      await this.recordHashes(this.registrable(items), STATUS_ACTOR);
    } catch {
      /* el registro es una ayuda: el estado se informa igual */
    }
    return items.map(toReport);
  }

  /** Base → archivos donde es seguro (falta o viejo). Los CHANGED e INVALID solo con `overwrite`. */
  async export(actor: Actor, opts: { overwrite?: boolean } = {}): Promise<ConfigFileReport[]> {
    return this.writeItems(actor, await this.scan(), { overwrite: opts.overwrite });
  }

  /** Igual que export pero sin lanzar (para llamar después de cada cambio, ya confirmada la transacción). */
  async exportAfterChange(actor: Actor): Promise<void> {
    if (this.suppressed > 0) return;
    try {
      await this.export(actor);
    } catch (err) {
      const message = sanitize(err instanceof Error ? err.message : String(err));
      console.warn(`[catalog] No se pudieron exportar los archivos de configuración: ${message}`);
      try {
        await this.core.audit.record({ actor, action: 'CONFIG_FILE_EXPORT_FAILED', entityType: 'ConfigFile', entityId: 'catalog', summary: `No se pudieron exportar los archivos de configuración: ${truncate(message, 300)}`, data: { message } });
      } catch {
        /* nunca lanza: el cambio ya está confirmado en la base */
      }
    }
  }

  /** Archivos → base, acción explícita del propietario, con las mismas validaciones que la UI. Sin `relPaths`, todos los CHANGED. */
  async apply(actor: Actor, relPaths?: string[]): Promise<ConfigFileReport[]> {
    const wanted = relPaths ? [...new Set(relPaths.map(normalizeRequestedPath))] : null;
    const items = await this.scan();
    const outcomes = new Map<string, ConfigFileReport>();
    const applied = new Set<string>();
    this.suppressed++;
    try {
      for (const it of items) {
        if (wanted ? !wanted.includes(it.relPath) : it.state !== 'CHANGED') continue;
        const f = it.file;
        if (!f.exists) {
          outcomes.set(it.relPath, { ...reportBase(it), state: it.state, message: 'No hay archivo para aplicar' });
          continue;
        }
        if (!f.ok || it.dbErrors || it.demo) {
          outcomes.set(it.relPath, { ...toReport(it), state: 'INVALID' });
          continue;
        }
        if (it.state === 'IN_SYNC') {
          outcomes.set(it.relPath, { ...reportBase(it), state: 'IN_SYNC', message: 'Sin cambios: el archivo ya refleja la base' });
          continue;
        }
        try {
          const message = await this.applyItem(it, f.value, actor);
          applied.add(it.relPath);
          outcomes.set(it.relPath, { ...reportBase(it), state: 'APPLIED', message });
          await this.core.audit.record({ actor, action: 'CONFIG_FILE_APPLIED', entityType: 'ConfigFile', entityId: it.relPath, summary: `catalog/${it.relPath} aplicado: ${truncate(message, 300)}`, data: { relPath: it.relPath, hash: f.hash } });
        } catch (err) {
          outcomes.set(it.relPath, { ...reportBase(it), state: 'INVALID', message: 'No se aplicó el archivo', errors: errorList(err) });
        }
      }
    } finally {
      this.suppressed--;
    }
    for (const rel of wanted ?? []) {
      if (items.some((i) => i.relPath === rel)) continue;
      outcomes.set(rel, {
        subject: rel.startsWith(`${PROJECTS_DIR}/`) ? 'project' : 'global',
        relPath: rel,
        state: 'INVALID',
        errors: [`${rel} no es un archivo de configuración del catálogo (${GLOBAL_FILE}, ${POLICIES_FILE}, ${CONNECTIONS_FILE}, ${PROVIDERS_FILE} o ${PROJECTS_DIR}/<CLAVE>.yaml)`],
      });
    }

    // Forma canónica de lo aplicado (con lo que la base no cambió, p. ej. políticas que no se borran) y lo pendiente.
    const after = await this.scan();
    let reports: ConfigFileReport[];
    try {
      reports = await this.writeItems(actor, after, { force: applied });
    } catch (err) {
      reports = after.map(toReport);
      for (const rel of applied) {
        const o = outcomes.get(rel);
        if (o) o.message = `${o.message ?? 'Aplicado'}. No se pudo reescribir el archivo: ${errorList(err).join('; ')}`;
      }
    }
    const out = reports.map((r) => outcomes.get(r.relPath) ?? r);
    for (const [rel, r] of outcomes) if (!out.some((x) => x.relPath === rel)) out.push(r);
    return out;
  }

  /** Instalación inicial: crea desde los archivos lo que falta en la base (global, proveedores, conexiones, proyectos, políticas). */
  async seedFromFiles(log: (m: string) => void = () => {}): Promise<{ created: string[] }> {
    const projectFiles = this.listProjectFiles();
    const present = [GLOBAL_FILE, POLICIES_FILE, CONNECTIONS_FILE, PROVIDERS_FILE].filter((rel) => {
      try {
        return this.store.readText(rel) !== null;
      } catch {
        return true; // existe pero no se puede leer: lo informa la lectura de abajo
      }
    });
    if (!present.length && !projectFiles.length) return { created: [] };

    const actor = SEED_ACTOR;
    const created: string[] = [];
    const read = <T>(subject: ConfigFileSubject, relPath: string, key?: string): T | null => {
      const f = this.readConfigFile(subject, relPath, key);
      if (!f.exists) return null;
      if (!f.ok) {
        log(`catalog/${relPath} no se usa: ${f.errors.join('; ')}`);
        return null;
      }
      return f.value as T;
    };
    const attempt = async (what: string, fn: () => Promise<unknown>) => {
      try {
        await fn();
        created.push(what);
        log(`${what} creado desde catalog/`);
      } catch (err) {
        log(`${what}: no se creó (${errorList(err).join('; ')})`);
      }
    };

    this.suppressed++;
    try {
      const global = read<GlobalConfig>('global', GLOBAL_FILE);
      if (global && !(await this.prisma.globalSetting.findUnique({ where: { key: GLOBAL_KEY } }))) {
        await attempt(GLOBAL_FILE, async () => {
          await this.prisma.globalSetting.create({ data: { key: GLOBAL_KEY, value: global as object, version: 1, updatedBy: actor.id } });
          await this.core.audit.record({ actor, action: 'GLOBAL_CONFIG_CHANGED', entityType: 'GlobalSetting', entityId: GLOBAL_KEY, summary: `Configuración global v1 desde catalog/${GLOBAL_FILE}` });
        });
      }

      for (const p of read<ProvidersFile>('providers', PROVIDERS_FILE)?.providers ?? []) {
        if (await this.prisma.modelProviderConfiguration.findUnique({ where: { key: p.key } })) continue;
        await attempt(`${PROVIDERS_FILE}: ${p.key}`, () => this.core.providers.create(p, actor));
      }

      for (const c of read<ConnectionsFile>('connections', CONNECTIONS_FILE)?.connections ?? []) {
        if (await this.prisma.connection.findUnique({ where: { key: c.key } })) continue;
        await attempt(`${CONNECTIONS_FILE}: ${c.key}`, async () => {
          if (c.kind !== 'MCP_STDIO' || c.purpose !== 'JIRA') throw new Error('solo se crean conexiones MCP_STDIO para JIRA');
          if (!c.envFile) throw new Error('falta envFile (archivo de credenciales dentro de MCP/)');
          const parsed = connectionCreateRequest.safeParse({ key: c.key, name: c.name, envFile: c.envFile });
          if (!parsed.success) throw new CatalogFileError('Conexión inválida', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
          await this.core.connections.create(parsed.data, actor);
        });
      }

      for (const key of projectFiles) {
        const relPath = projectFileRelPath(key);
        const p = read<ProjectFile>('project', relPath, key);
        if (!p || (await this.prisma.project.findUnique({ where: { key } }))) continue;
        await attempt(relPath, async () => {
          let providerKey = p.provider ?? null;
          if (providerKey && !(await this.prisma.modelProviderConfiguration.findUnique({ where: { key: providerKey } }))) {
            log(`catalog/${relPath}: el proveedor ${providerKey} no existe; el proyecto queda sin proveedor por defecto`);
            providerKey = null;
          }
          await this.core.config.createProject(
            { key, name: p.name, description: p.description, jiraProjectKey: p.jiraProjectKey, mode: p.mode, status: p.status, connectionKey: p.connection ?? null, providerKey },
            actor,
            { config: p.config, changeNote: `Configuración inicial desde catalog/${relPath}` },
          );
        });
      }

      for (const e of read<PoliciesFile>('policies', POLICIES_FILE)?.policies ?? []) {
        let projectId: string | null = null;
        if (e.scope === 'PROJECT') {
          const project = await this.prisma.project.findUnique({ where: { key: e.project! } });
          if (!project || project.mode === 'DEMO') {
            log(`${POLICIES_FILE}: ${policyLabel(e)} no se crea (el proyecto no existe o está en modo DEMO)`);
            continue;
          }
          projectId = project.id;
        }
        const active = await this.prisma.approvalPolicy.findFirst({ where: { scope: e.scope, projectId, orchestratorKey: e.orchestrator ?? null, operationType: e.operation, status: 'ACTIVE' } });
        if (active) continue;
        await attempt(`${POLICIES_FILE}: ${policyLabel(e)}`, () =>
          this.core.policies.upsert({ scope: e.scope, projectKey: e.project, orchestratorKey: e.orchestrator, operationType: e.operation, mode: e.mode, mandatory: e.mandatory, description: e.description, rules: e.rules }, actor),
        );
      }
    } finally {
      this.suppressed--;
    }

    try {
      await this.recordHashes(this.registrable(await this.scan()), actor);
    } catch (err) {
      log(`No se registraron los archivos sincronizados: ${errorList(err).join('; ')}`);
    }
    return { created };
  }

  // ---------- Lectura y estado ----------

  private listProjectFiles(): string[] {
    try {
      return this.store.listYaml(PROJECTS_DIR);
    } catch {
      return [];
    }
  }

  private readConfigFile(subject: ConfigFileSubject, relPath: string, key?: string): FileRead {
    let text: string | null;
    try {
      text = this.store.readText(relPath);
    } catch (err) {
      return { exists: true, ok: false, errors: errorList(err) };
    }
    if (text === null) return { exists: false };
    try {
      const value = normalizeConfigFile(subject, parseYamlFile(text, relPath), key);
      return { exists: true, ok: true, value, hash: configHash(value) };
    } catch (err) {
      return { exists: true, ok: false, errors: errorList(err) };
    }
  }

  /** Lee la base y los archivos y clasifica cada archivo. No escribe nada. */
  private async scan(): Promise<ScanItem[]> {
    const prisma = this.prisma;
    const [globalRow, policyRows, projects, connections, providers, registryRow] = await Promise.all([
      prisma.globalSetting.findUnique({ where: { key: GLOBAL_KEY } }),
      prisma.approvalPolicy.findMany({ where: { status: 'ACTIVE' } }),
      prisma.project.findMany({
        include: { connection: { select: { key: true } }, defaultProvider: { select: { key: true } }, configurations: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 } },
      }),
      prisma.connection.findMany(),
      prisma.modelProviderConfiguration.findMany(),
      prisma.globalSetting.findUnique({ where: { key: REGISTRY_KEY } }),
    ]);
    const registry = parseRegistry(registryRow?.value);
    const items: ScanItem[] = [];
    const add = (subject: ConfigFileSubject, relPath: string, fromDb: () => unknown, extra: { key?: string; demo?: boolean } = {}) => {
      let db: unknown = null;
      let dbHash: string | null = null;
      let dbErrors: string[] | undefined;
      try {
        db = fromDb();
        dbHash = db === null ? null : configHash(db);
      } catch (err) {
        dbErrors = errorList(err);
      }
      items.push(classify({ subject, relPath, ...extra, db, dbHash, ...(dbErrors ? { dbErrors } : {}), file: this.readConfigFile(subject, relPath, extra.key) }, registry));
    };

    add('global', GLOBAL_FILE, () => globalFromDb(globalRow?.value));
    add('policies', POLICIES_FILE, () => policiesFromDb(policyRows, new Map(projects.map((p) => [p.id, { key: p.key, mode: p.mode }]))));
    add('connections', CONNECTIONS_FILE, () => connectionsFromDb(connections));
    add('providers', PROVIDERS_FILE, () => providersFromDb(providers));
    const byKey = new Map(projects.map((p) => [p.key, p]));
    const keys = [...new Set([...projects.filter((p) => p.mode !== 'DEMO').map((p) => p.key), ...this.listProjectFiles()])].sort();
    for (const key of keys) {
      const p = byKey.get(key);
      add('project', projectFileRelPath(key), () => (p && p.mode !== 'DEMO' ? projectFromDb(p, p.configurations[0]?.config) : null), { key, demo: p?.mode === 'DEMO' });
    }
    return items;
  }

  // ---------- Escritura y registro ----------

  private registrable(items: ScanItem[]) {
    return items.filter((i) => i.register && i.dbHash).map((i) => ({ relPath: i.relPath, hash: i.dbHash! }));
  }

  private async recordHashes(entries: { relPath: string; hash: string }[], actor: Actor) {
    if (!entries.length) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.globalSetting.createMany({ data: [{ key: REGISTRY_KEY, value: {}, version: 0, updatedBy: actor.id }], skipDuplicates: true });
      // Bloquea la fila: dos exportaciones simultáneas no se pisan el historial.
      await tx.$queryRaw`SELECT "key" FROM "GlobalSetting" WHERE "key" = ${REGISTRY_KEY} FOR UPDATE`;
      const row = await tx.globalSetting.findUniqueOrThrow({ where: { key: REGISTRY_KEY } });
      const registry = parseRegistry(row.value);
      if (!registerHashes(registry, entries)) return;
      await tx.globalSetting.update({ where: { key: REGISTRY_KEY }, data: { value: registry as object, version: row.version + 1, updatedBy: actor.id } });
    });
  }

  /** Escribe MISSING_FILE, STALE_FILE, los forzados (recién aplicados) y, con `overwrite`, CHANGED e INVALID. */
  private async writeItems(actor: Actor, items: ScanItem[], opts: { overwrite?: boolean; force?: Set<string> }): Promise<ConfigFileReport[]> {
    const reports: ConfigFileReport[] = [];
    const hashes = this.registrable(items);
    const touched: string[] = [];
    const failures: string[] = [];
    for (const it of items) {
      const write =
        !it.dbErrors && (opts.force?.has(it.relPath) || it.state === 'MISSING_FILE' || it.state === 'STALE_FILE' || (opts.overwrite && (it.state === 'CHANGED' || it.state === 'INVALID')));
      if (!write) {
        reports.push(toReport(it));
        continue;
      }
      try {
        if (it.db !== null) {
          const changed = this.store.writeYaml(it.relPath, renderConfigValue(it.subject, it.db), configFileHeader(it.subject, it.key));
          hashes.push({ relPath: it.relPath, hash: it.dbHash! });
          if (changed) touched.push(it.relPath);
          reports.push({ ...reportBase(it), state: 'EXPORTED', message: it.state === 'MISSING_FILE' ? 'Archivo creado desde la base' : 'Archivo reescrito desde la base' });
        } else if (it.file.exists) {
          this.store.removeFile(it.relPath);
          touched.push(it.relPath);
          reports.push({ ...reportBase(it), state: 'EXPORTED', message: 'Archivo borrado: el proyecto ya no existe o está en modo DEMO' });
        } else {
          reports.push(toReport(it));
        }
      } catch (err) {
        failures.push(`${it.relPath}: ${errorList(err).join('; ')}`);
        reports.push(toReport(it));
      }
    }
    await this.recordHashes(hashes, actor);
    if (touched.length) {
      await this.core.audit.record({
        actor,
        action: 'CONFIG_FILE_EXPORTED',
        entityType: 'ConfigFile',
        entityId: touched.length === 1 ? touched[0] : 'catalog',
        summary: `Archivos de configuración exportados: ${touched.join(', ')}`,
        data: { files: touched },
      });
    }
    if (failures.length) throw new Error(`No se pudieron escribir archivos de configuración: ${failures.join(' | ')}`);
    return reports;
  }

  // ---------- Aplicar archivos ----------

  private async applyItem(it: ScanItem, value: unknown, actor: Actor): Promise<string> {
    switch (it.subject) {
      case 'global': {
        const row = await this.core.config.setGlobal(value, actor);
        return `Configuración global v${row.version}`;
      }
      case 'policies':
        return this.applyPolicies(value as PoliciesFile, actor);
      case 'connections':
        return this.applyConnections(value as ConnectionsFile, actor);
      case 'providers':
        return this.applyProviders(value as ProvidersFile, actor);
      case 'project':
        return this.applyProject(it.key!, value as ProjectFile, it.relPath, actor);
    }
  }

  /**
   * Registra una versión nueva por cada política distinta de la activa del mismo ámbito y operación. Antes valida todo
   * el archivo (piso de seguridad, obligatorias, proyectos): si algo falla, no se aplica ninguna. Las políticas activas
   * que faltan en el archivo no se borran.
   */
  private async applyPolicies(file: PoliciesFile, actor: Actor): Promise<string> {
    const [rows, projects] = await Promise.all([this.prisma.approvalPolicy.findMany({ where: { status: 'ACTIVE' } }), this.prisma.project.findMany({ select: { id: true, key: true, mode: true } })]);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const byKey = new Map(projects.map((p) => [p.key, p]));
    const current = new Map(policiesFromDb(rows, byId).policies.map((p) => [policyIdentity(p), p]));
    const changes = file.policies.filter((p) => {
      const c = current.get(policyIdentity(p));
      return !c || configHash(c) !== configHash(p);
    });

    const errors: string[] = [];
    let working: PolicyRecord[] = rows.map((r) => ({ id: r.id, scope: r.scope, projectId: r.projectId, orchestratorKey: r.orchestratorKey, operationType: r.operationType, mode: r.mode, mandatory: r.mandatory, version: r.version, status: r.status }));
    for (const p of changes) {
      let projectId: string | null = null;
      if (p.scope === 'PROJECT') {
        const project = byKey.get(p.project!);
        if (!project) {
          errors.push(`${policyLabel(p)}: el proyecto ${p.project} no existe`);
          continue;
        }
        if (project.mode === 'DEMO') {
          errors.push(`${policyLabel(p)}: el proyecto ${p.project} está en modo DEMO`);
          continue;
        }
        projectId = project.id;
      }
      const problem = checkPolicyChange(working, { scope: p.scope, operationType: p.operation, mode: p.mode, mandatory: p.mandatory });
      if (problem) {
        errors.push(`${policyLabel(p)}: ${problem}`);
        continue;
      }
      const same = (w: PolicyRecord) => w.scope === p.scope && w.projectId === projectId && (w.orchestratorKey ?? null) === (p.orchestrator ?? null) && w.operationType === p.operation;
      const version = working.filter(same).reduce((m, w) => Math.max(m, w.version), 0) + 1;
      working = [...working.filter((w) => !same(w)), { id: `archivo:${policyIdentity(p)}`, scope: p.scope, projectId, orchestratorKey: p.orchestrator ?? null, operationType: p.operation, mode: p.mode, mandatory: p.mandatory, version, status: 'ACTIVE' }];
    }
    if (errors.length) throw new CatalogFileError(`No se aplicó ninguna política: ${errors.join('; ')}`, errors);

    let done = 0;
    try {
      for (const p of changes) {
        await this.core.policies.upsert({ scope: p.scope, projectKey: p.project, orchestratorKey: p.orchestrator, operationType: p.operation, mode: p.mode, mandatory: p.mandatory, description: p.description, rules: p.rules }, actor);
        done++;
      }
    } catch (err) {
      throw new CatalogFileError(`Se aplicaron ${done} de ${changes.length} políticas antes del error`, [...errorList(err), `Se aplicaron ${done} de ${changes.length} políticas antes del error`]);
    }
    const fileIds = new Set(file.policies.map(policyIdentity));
    const missing = [...current.values()].filter((p) => !fileIds.has(policyIdentity(p)));
    const parts = [changes.length ? `${changes.length} política(s) aplicada(s): ${changes.map(policyLabel).join(', ')}` : 'Sin cambios en las políticas'];
    if (missing.length) parts.push(`no se borran las políticas activas que faltan en el archivo (${missing.map(policyLabel).join(', ')}): se vuelven a exportar`);
    return parts.join('; ');
  }

  /** Crea o actualiza conexiones (nombre y archivo de credenciales). Nunca habilita la escritura ni borra conexiones. */
  private async applyConnections(file: ConnectionsFile, actor: Actor): Promise<string> {
    const current = new Map(connectionsFromDb(await this.prisma.connection.findMany()).connections.map((c) => [c.key, c]));
    const errors: string[] = [];
    const ops: { label: string; run: () => Promise<unknown> }[] = [];
    const envFileOf = (label: string, envFile: string): string | null => {
      try {
        return normalizeEnvFile(envFile);
      } catch (err) {
        errors.push(`${label}: ${errorList(err).join('; ')}`);
        return null;
      }
    };
    for (const c of file.connections) {
      const cur = current.get(c.key);
      if (cur && configHash(cur) === configHash(c)) continue;
      const label = `Conexión ${c.key}`;
      if (!cur) {
        if (c.kind !== 'MCP_STDIO' || c.purpose !== 'JIRA') {
          errors.push(`${label}: solo se pueden crear conexiones MCP_STDIO para JIRA`);
          continue;
        }
        if (!c.envFile) {
          errors.push(`${label}: falta envFile (archivo de credenciales dentro de MCP/)`);
          continue;
        }
        const parsed = connectionCreateRequest.safeParse({ key: c.key, name: c.name, envFile: c.envFile });
        if (!parsed.success) {
          errors.push(...parsed.error.issues.map((i) => `${label}: ${i.path.join('.')}: ${i.message}`));
          continue;
        }
        if (envFileOf(label, c.envFile) === null) continue;
        ops.push({ label: `${c.key} creada`, run: () => this.core.connections.create(parsed.data, actor) });
        continue;
      }
      if (cur.kind !== c.kind || cur.purpose !== c.purpose) {
        errors.push(`${label}: no se puede cambiar kind ni purpose desde el archivo`);
        continue;
      }
      let envFile: string | undefined;
      if (c.envFile !== cur.envFile) {
        if (!c.envFile) {
          errors.push(`${label}: falta envFile (archivo de credenciales dentro de MCP/)`);
          continue;
        }
        if (cur.kind !== 'MCP_STDIO') {
          errors.push(`${label}: envFile solo aplica a conexiones MCP_STDIO`);
          continue;
        }
        const normalized = envFileOf(label, c.envFile);
        if (normalized === null) continue;
        if (normalized !== cur.envFile) envFile = normalized;
      }
      const patch = { name: c.name !== cur.name ? c.name : undefined, envFile };
      const parsed = connectionUpdateRequest.safeParse(patch);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((i) => `${label}: ${i.path.join('.')}: ${i.message}`));
        continue;
      }
      if (patch.name === undefined && patch.envFile === undefined) continue;
      ops.push({ label: `${c.key} actualizada`, run: () => this.core.connections.update(c.key, parsed.data, actor) });
    }
    if (errors.length) throw new CatalogFileError(`No se aplicó ninguna conexión: ${errors.join('; ')}`, errors);
    for (const op of ops) await op.run();
    const fileKeys = new Set(file.connections.map((c) => c.key));
    const missing = [...current.keys()].filter((k) => !fileKeys.has(k));
    const parts = [ops.length ? `Conexiones: ${ops.map((o) => o.label).join(', ')} (escritura deshabilitada al crear)` : 'Sin cambios en las conexiones'];
    if (missing.length) parts.push(`no se borran las conexiones que faltan en el archivo (${missing.join(', ')})`);
    return parts.join('; ');
  }

  /** Crea o actualiza proveedores (la configuración del archivo reemplaza la de la base, siempre sin secretos). */
  private async applyProviders(file: ProvidersFile, actor: Actor): Promise<string> {
    const rows = await this.prisma.modelProviderConfiguration.findMany();
    const rowByKey = new Map(rows.map((r) => [r.key, r]));
    const current = new Map(providersFromDb(rows).providers.map((p) => [p.key, p]));
    const errors: string[] = [];
    const ops: { label: string; run: () => Promise<unknown> }[] = [];
    for (const p of file.providers) {
      const row = rowByKey.get(p.key);
      const cur = current.get(p.key);
      if (cur && configHash(cur) === configHash(p)) continue;
      const label = `Proveedor ${p.key}`;
      if (!row) {
        ops.push({ label: `${p.key} creado`, run: () => this.core.providers.create(p, actor) });
        continue;
      }
      if (row.kind === 'MOCK') {
        errors.push(`${label}: el proveedor simulado no se administra desde archivos`);
        continue;
      }
      if (!cur || cur.kind !== p.kind) {
        errors.push(`${label}: no se puede cambiar kind desde el archivo`);
        continue;
      }
      const patch = {
        name: p.name !== cur.name ? p.name : undefined,
        enabled: p.enabled !== cur.enabled ? p.enabled : undefined,
        isDefault: p.isDefault !== cur.isDefault ? p.isDefault : undefined,
        config: configHash(p.config) !== configHash(cur.config) ? p.config : undefined,
      };
      ops.push({ label: `${p.key} actualizado`, run: () => this.core.providers.update(p.key, patch, actor, { replaceConfig: true }) });
    }
    if (errors.length) throw new CatalogFileError(`No se aplicó ningún proveedor: ${errors.join('; ')}`, errors);
    for (const op of ops) await op.run();
    const fileKeys = new Set(file.providers.map((p) => p.key));
    const missing = [...current.keys()].filter((k) => !fileKeys.has(k));
    const parts = [ops.length ? `Proveedores: ${ops.map((o) => o.label).join(', ')}` : 'Sin cambios en los proveedores'];
    if (missing.length) parts.push(`no se borran los proveedores que faltan en el archivo (${missing.join(', ')})`);
    return parts.join('; ');
  }

  /** Crea el proyecto si no existe; si existe, actualiza metadatos y guarda una versión nueva de la configuración si difiere. */
  private async applyProject(key: string, file: ProjectFile, relPath: string, actor: Actor): Promise<string> {
    const changeNote = `Aplicado desde catalog/${relPath}`;
    const project = await this.prisma.project.findUnique({
      where: { key },
      include: { connection: { select: { key: true } }, defaultProvider: { select: { key: true } }, configurations: { where: { status: 'ACTIVE' }, orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!project) {
      await this.core.config.createProject(
        { key, name: file.name, description: file.description, jiraProjectKey: file.jiraProjectKey, mode: file.mode, status: file.status, connectionKey: file.connection ?? null, providerKey: file.provider ?? null },
        actor,
        { config: file.config, changeNote },
      );
      return `Proyecto ${key} creado con la configuración v1`;
    }
    if (project.mode === 'DEMO') throw new CatalogFileError(`El proyecto ${key} está en modo DEMO: los proyectos DEMO no se administran desde archivos`);
    // Validar la configuración antes de tocar los metadatos (no inventar campos de Jira).
    checkJiraFields(file.config);
    const current = projectFromDb(project, project.configurations[0]?.config);
    const patch: ProjectUpdateInput = {};
    if (file.name !== current.name) patch.name = file.name;
    if (file.description !== current.description) patch.description = file.description;
    if (file.jiraProjectKey !== current.jiraProjectKey) patch.jiraProjectKey = file.jiraProjectKey;
    if (file.mode !== current.mode) patch.mode = file.mode;
    if (file.status !== current.status) patch.status = file.status as ProjectUpdateInput['status'];
    if ((file.connection ?? null) !== (current.connection ?? null)) patch.connectionKey = file.connection ?? null;
    if ((file.provider ?? null) !== (current.provider ?? null)) patch.providerKey = file.provider ?? null;
    const parts: string[] = [];
    if (Object.keys(patch).length) {
      await this.core.config.updateProject(key, patch, actor);
      parts.push(`metadatos (${Object.keys(patch).join(', ')})`);
    }
    if (configHash(current.config) !== configHash(file.config)) {
      const row = await this.core.config.saveProjectConfig(key, file.config, changeNote, actor);
      parts.push(`configuración v${row.version}`);
    }
    return parts.length ? `Proyecto ${key}: ${parts.join(' y ')}` : `Proyecto ${key} sin cambios`;
  }
}
