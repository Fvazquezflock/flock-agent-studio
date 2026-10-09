import type { Core } from '../core';
import type { Actor } from '../context';
import { PlatformError } from '../util/errors';
import { sanitize } from '../util/sanitize';
import { KIND_META, type EntityRow, type VersionRow } from './catalog-service';
import { CATALOG_KINDS, CatalogFileError, catalogRelPath, safeDefinitionHash } from './file-format';
import type { LoadedCatalogFile } from './file-store';
import type { CatalogKind } from './validation';

/**
 * Estado de un archivo del catálogo frente a la base.
 * - IN_SYNC: el archivo es la versión activa.
 * - MISSING_FILE: hay versión activa y no hay archivo (se escribe al exportar).
 * - STALE_FILE: el archivo coincide con una versión vieja (INACTIVE, ARCHIVED o REJECTED): se reescribe desde la activa
 *   (o se borra si la entidad no tiene versión activa).
 * - PENDING_APPROVAL: el contenido del archivo ya está en la base como versión DRAFT, PENDING_APPROVAL o APPROVED.
 * - CHANGED: contenido nuevo en el archivo de una entidad existente (se importa como versión pendiente de aprobación).
 * - NEW: archivo sin entidad en la base (se crea con v1 pendiente de aprobación).
 * - INVALID: el archivo no se puede leer o no valida (esquema o referencias); nunca se importa.
 * - INACTIVE: entidad sin versión activa y sin archivo.
 * Resultados de una acción: EXPORTED (se escribió el archivo), REMOVED (se borró), IMPORTED (nueva versión + solicitud de activación).
 */
export type CatalogFileState =
  | 'IN_SYNC'
  | 'MISSING_FILE'
  | 'STALE_FILE'
  | 'PENDING_APPROVAL'
  | 'CHANGED'
  | 'NEW'
  | 'INVALID'
  | 'INACTIVE'
  | 'EXPORTED'
  | 'REMOVED'
  | 'IMPORTED';

export interface CatalogFileReport {
  kind: CatalogKind;
  key: string;
  /** Relativa a la carpeta del catálogo (p. ej. `agents/MainSupervisor.md`). */
  relPath: string;
  state: CatalogFileState;
  /** Versión de la base relacionada (activa, pendiente o importada). */
  version?: number;
  /** Solicitud de activación creada o vigente (AP-n). */
  approvalRequestId?: string;
  approvalNumber?: number;
  message?: string;
  errors?: string[];
}

/**
 * - status: solo informa, no escribe archivos ni la base.
 * - export: la base manda para lo que ya conoce (escribe MISSING_FILE/STALE_FILE, borra archivos de entidades inactivas);
 *   no importa contenido nuevo ni pisa archivos con cambios sin importar (quedan CHANGED/NEW).
 * - sync: export + importa CHANGED/NEW como versiones pendientes de aprobación (con su solicitud de activación).
 */
export type CatalogSyncMode = 'status' | 'export' | 'sync';

export interface CatalogSyncOptions {
  mode: CatalogSyncMode;
  /** Limitar a algunos tipos o claves. */
  kinds?: CatalogKind[];
  keys?: string[];
  /**
   * Solo modo export: sobrescribe también archivos con contenido desconocido de entidades que existen en la base (CHANGED
   * e INVALID se reemplazan por la versión activa, o se borran si no hay activa). Los archivos de entidades que la base no
   * conoce (NEW) nunca se borran. Para la migración inicial desde una base existente. Nunca lo usa el arranque.
   */
  overwrite?: boolean;
}

/** Actor de las sincronizaciones que no dispara una persona (arranque, script). */
export const FILE_SYNC_ACTOR: Actor = { type: 'SYSTEM', id: 'sincronización de archivos' };

/** Etiquetas para resúmenes en consola (seed, script). */
export const CATALOG_STATE_LABEL: Record<CatalogFileState, string> = {
  IN_SYNC: 'al día',
  MISSING_FILE: 'sin archivo',
  STALE_FILE: 'archivo viejo',
  PENDING_APPROVAL: 'pendiente de aprobación',
  CHANGED: 'con cambios sin importar',
  NEW: 'nuevo sin importar',
  INVALID: 'inválido',
  INACTIVE: 'inactivo',
  EXPORTED: 'exportado',
  REMOVED: 'borrado',
  IMPORTED: 'importado (pendiente de aprobación)',
};

/** "al día: 17, importado (pendiente de aprobación): 1". */
export function summarizeCatalogReports(reports: CatalogFileReport[]): string {
  const counts = new Map<CatalogFileState, number>();
  for (const r of reports) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
  if (!counts.size) return 'sin definiciones';
  return [...counts].map(([s, n]) => `${CATALOG_STATE_LABEL[s]}: ${n}`).join(', ');
}

const PENDING_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'];
const STALE_STATUSES = ['INACTIVE', 'ARCHIVED', 'REJECTED'];
const OPEN_REQUEST = ['PENDING', 'PARTIALLY_DECIDED'] as const;

type Entity = EntityRow & { activeVersion: VersionRow | null; versions: VersionRow[] };
type FindMany = { findMany: (args: unknown) => Promise<Entity[]> };

/** Sincronización entre la carpeta `catalog/` (agentes, skills, orquestadores) y el catálogo versionado de la base. */
export class CatalogSyncService {
  constructor(private readonly core: Core) {}

  /** Reconciliación según el modo. Las importaciones y exportaciones quedan auditadas. */
  async reconcile(actor: Actor, opts: CatalogSyncOptions): Promise<CatalogFileReport[]> {
    const keys = opts.keys ? new Set(opts.keys) : null;
    const out: CatalogFileReport[] = [];
    if (opts.mode === 'sync') {
      // En una base sin catálogo, importar dejaría todo pendiente de aprobación y el seed ya no haría la instalación inicial.
      const prisma = this.core.deps.prisma;
      const installed = (await prisma.agent.count()) + (await prisma.skill.count()) + (await prisma.orchestrator.count());
      if (!installed) throw new PlatformError('VALIDATION_ERROR', 'La base no tiene catálogo instalado: corré pnpm db:seed para instalarlo desde los archivos.');
    }
    // Orden skill → agente → orquestador: lo importado antes ya existe cuando se validan las referencias de lo siguiente.
    for (const kind of CATALOG_KINDS.filter((k) => !opts.kinds || opts.kinds.includes(k))) {
      const m = KIND_META[kind];
      const rows = await (this.core.deps.prisma as unknown as Record<string, FindMany>)[m.entity].findMany({
        where: keys ? { key: { in: [...keys] } } : undefined,
        include: { activeVersion: true, versions: { orderBy: { version: 'desc' } } },
      });
      const byKey = new Map(rows.map((r) => [r.key, r]));
      const all = new Set([...byKey.keys(), ...this.core.catalogFiles.list(kind).map((e) => e.key)]);
      for (const key of [...all].sort()) {
        if (keys && !keys.has(key)) continue;
        try {
          out.push(await this.reconcileOne(kind, key, byKey.get(key) ?? null, actor, opts));
        } catch (err) {
          // Una ruta imposible para el catálogo (clave inválida) no corta el resto; los errores de disco o base sí.
          if (!(err instanceof CatalogFileError)) throw err;
          out.push({ kind, key, relPath: catalogRelPath(kind, key), state: 'INVALID', errors: err.errors });
        }
      }
    }
    return out;
  }

  /** Atajo: estado sin escribir nada. */
  status(kinds?: CatalogKind[]): Promise<CatalogFileReport[]> {
    return this.reconcile(FILE_SYNC_ACTOR, { mode: 'status', kinds });
  }

  /**
   * Exporta después de un cambio en la base (activación, desactivación, propuesta aplicada). Nunca lanza: un error de
   * disco no debe deshacer una decisión ya confirmada (queda en la auditoría y en la consola).
   */
  async exportAfterChange(actor: Actor, kinds?: CatalogKind[], keys?: string[]): Promise<void> {
    try {
      await this.reconcile(actor, { mode: 'export', kinds, keys });
    } catch (err) {
      const message = sanitize(err instanceof Error ? err.message : String(err));
      console.warn(`No se pudieron actualizar los archivos de catalog/: ${message}`);
      try {
        await this.core.audit.record({
          actor,
          action: 'CATALOG_FILE_EXPORT_FAILED',
          entityType: 'Catálogo',
          entityId: keys?.join(',') || kinds?.join(',') || 'catalog',
          summary: `No se pudieron actualizar los archivos de catalog/: ${message}`,
          data: { kinds, keys, message },
        });
      } catch {
        // Sin base tampoco hay auditoría: queda el aviso en la consola.
      }
    }
  }

  private async reconcileOne(kind: CatalogKind, key: string, entity: Entity | null, actor: Actor, opts: CatalogSyncOptions): Promise<CatalogFileReport> {
    const base = { kind, key, relPath: catalogRelPath(kind, key) };
    const active = entity?.activeVersion ?? null;
    const writes = opts.mode !== 'status';
    const overwrite = opts.mode === 'export' && !!opts.overwrite && !!entity;
    const loaded = this.core.catalogFiles.load(kind, key);

    if (!loaded) {
      if (!active) return { ...base, state: 'INACTIVE', message: entity ? `Sin versión activa (${entity.status})` : undefined };
      if (!writes) return { ...base, state: 'MISSING_FILE', version: active.version, message: `Falta el archivo de la versión activa v${active.version}` };
      return this.writeActive(kind, key, active, actor, 'MISSING_FILE');
    }
    if (!loaded.ok) {
      if (overwrite) return this.replace(kind, key, active, actor, 'INVALID');
      return { ...base, state: 'INVALID', version: active?.version, errors: loaded.errors, message: 'No se importa hasta corregirlo' };
    }

    if (active && safeDefinitionHash(kind, active.definition) === loaded.hash) return { ...base, state: 'IN_SYNC', version: active.version };

    // ¿El contenido ya está en la base? Versiones viejas que no cumplen el esquema actual nunca coinciden (hash null).
    const same = (entity?.versions ?? []).filter((v) => v.id !== active?.id && safeDefinitionHash(kind, v.definition) === loaded.hash);
    const pending = same.find((v) => PENDING_STATUSES.includes(v.status));
    if (pending) {
      const ap = await this.openRequest(kind, pending);
      return {
        ...base,
        state: 'PENDING_APPROVAL',
        version: pending.version,
        approvalRequestId: ap?.id,
        approvalNumber: ap?.number,
        message: ap ? `v${pending.version} espera aprobación (AP-${ap.number})` : `v${pending.version} está ${pending.status} sin solicitud de activación abierta`,
      };
    }
    const stale = same.find((v) => STALE_STATUSES.includes(v.status));
    if (stale) {
      if (writes) return this.replace(kind, key, active, actor, 'STALE_FILE');
      return { ...base, state: 'STALE_FILE', version: stale.version, message: `Coincide con v${stale.version} (${stale.status})${active ? `; la activa es v${active.version}` : '; sin versión activa'}` };
    }

    // Contenido nuevo.
    const state = entity ? 'CHANGED' : 'NEW';
    if (opts.mode === 'sync') return this.importFile(kind, key, entity, loaded, actor);
    if (overwrite) return this.replace(kind, key, active, actor, state);
    return {
      ...base,
      state,
      version: active?.version,
      message: `Contenido nuevo sin importar${active ? ` (la activa es v${active.version})` : ''}: la sincronización lo carga como versión pendiente de aprobación`,
    };
  }

  /** La base manda: escribe la versión activa o, si no hay, borra el archivo. */
  private async replace(kind: CatalogKind, key: string, active: VersionRow | null, actor: Actor, from: CatalogFileState): Promise<CatalogFileReport> {
    if (active) return this.writeActive(kind, key, active, actor, from);
    const m = KIND_META[kind];
    const relPath = catalogRelPath(kind, key);
    if (this.core.catalogFiles.remove(kind, key)) {
      await this.core.audit.record({ actor, action: 'CATALOG_FILE_REMOVED', entityType: m.label, entityId: key, summary: `catalog/${relPath} borrado: ${m.label.toLowerCase()} ${key} sin versión activa`, data: { relPath, previousState: from } });
    }
    return { kind, key, relPath, state: 'REMOVED', message: `Sin versión activa: se borró el archivo (estaba ${from})` };
  }

  private async writeActive(kind: CatalogKind, key: string, active: VersionRow, actor: Actor, from: CatalogFileState): Promise<CatalogFileReport> {
    const m = KIND_META[kind];
    const relPath = catalogRelPath(kind, key);
    let changed: boolean;
    try {
      changed = this.core.catalogFiles.write(kind, key, active.definition).changed;
    } catch (err) {
      if (!(err instanceof CatalogFileError)) throw err;
      return { kind, key, relPath, state: 'INVALID', version: active.version, errors: err.errors, message: `La versión activa v${active.version} no cumple el esquema actual: no se puede exportar` };
    }
    if (changed) {
      await this.core.audit.record({ actor, action: 'CATALOG_FILE_EXPORTED', entityType: m.label, entityId: key, summary: `catalog/${relPath} escrito desde ${key} v${active.version}`, data: { relPath, version: active.version, previousState: from } });
    }
    return { kind, key, relPath, state: 'EXPORTED', version: active.version, message: `Escrito desde la versión activa v${active.version} (estaba ${from})` };
  }

  /** Contenido nuevo → versión DRAFT + solicitud de activación. Nunca activa directo. */
  private async importFile(kind: CatalogKind, key: string, entity: Entity | null, loaded: Extract<LoadedCatalogFile, { ok: true }>, actor: Actor): Promise<CatalogFileReport> {
    const m = KIND_META[kind];
    const relPath = catalogRelPath(kind, key);
    const base = { kind, key, relPath };
    const check = await this.core.catalog.validate(kind, loaded.definition, key);
    if (!check.valid) return { ...base, state: 'INVALID', version: entity?.activeVersion?.version, errors: check.errors, message: 'No se importó: referencias o reglas inválidas' };

    const note = `Importado desde catalog/${relPath}`;
    let version: number;
    try {
      const created = entity ? await this.core.catalog.createVersion(kind, key, loaded.definition, note, actor) : await this.core.catalog.create(kind, key, loaded.definition, note, actor);
      version = created.version.version;
    } catch (err) {
      if (!(err instanceof PlatformError)) throw err;
      const detail = err.details?.errors;
      return { ...base, state: 'INVALID', version: entity?.activeVersion?.version, errors: Array.isArray(detail) ? detail.map(String) : [err.message], message: 'No se importó' };
    }

    let request: { id: string; number: number } | null = null;
    let failure: string | null = null;
    try {
      request = await this.core.catalog.requestActivation(kind, key, version, actor);
    } catch (err) {
      failure = sanitize(err instanceof Error ? err.message : String(err));
    }
    await this.core.audit.record({
      actor,
      action: 'CATALOG_FILE_IMPORTED',
      entityType: m.label,
      entityId: key,
      summary: `catalog/${relPath} importado como ${key} v${version}${request ? ` (AP-${request.number})` : ' (borrador)'}`,
      data: { relPath, version, approvalRequestId: request?.id ?? null, warnings: check.warnings, error: failure },
    });
    const warnings = check.warnings.length ? `. Advertencias: ${check.warnings.join('; ')}` : '';
    return {
      ...base,
      state: 'IMPORTED',
      version,
      approvalRequestId: request?.id,
      approvalNumber: request?.number,
      message: (request ? `v${version} espera aprobación (AP-${request.number})` : `v${version} creada, pero no se pudo pedir su activación: ${failure}`) + warnings,
    };
  }

  /** Solicitud abierta que activaría la versión: la de activación o, si vino de una propuesta, la del plan de la propuesta. */
  private async openRequest(kind: CatalogKind, v: VersionRow): Promise<{ id: string; number: number } | null> {
    const prisma = this.core.deps.prisma;
    const select = { id: true, number: true } as const;
    const direct = await prisma.approvalRequest.findFirst({
      where: { kind: 'activation', subjectType: kind, subjectId: v.id, status: { in: [...OPEN_REQUEST] } },
      orderBy: { number: 'desc' },
      select,
    });
    if (direct || !v.sourceProposalId) return direct;
    return prisma.approvalRequest.findFirst({ where: { kind: 'capability_proposal', subjectId: v.sourceProposalId, status: { in: [...OPEN_REQUEST] } }, orderBy: { number: 'desc' }, select });
  }
}
