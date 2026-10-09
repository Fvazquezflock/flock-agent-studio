import type { OperationType } from '@mao/shared';
import type { Prisma } from '@mao/db';
import type { Core } from '../core';
import type { Actor } from '../context';
import { contentHash } from '../util/hash';
import { diffJson } from '../util/diff';
import { PlatformError, invalid, notFound } from '../util/errors';
import { validateDefinition, type CatalogIndex, type CatalogKind, type ValidationResult } from './validation';

interface KindMeta {
  entity: 'agent' | 'skill' | 'orchestrator';
  version: 'agentVersion' | 'skillVersion' | 'orchestratorVersion';
  fk: 'agentId' | 'skillId' | 'orchestratorId';
  label: string;
  activationOp: OperationType;
}

export const KIND_META: Record<CatalogKind, KindMeta> = {
  agent: { entity: 'agent', version: 'agentVersion', fk: 'agentId', label: 'Agente', activationOp: 'ACTIVATE_AGENT' },
  skill: { entity: 'skill', version: 'skillVersion', fk: 'skillId', label: 'Skill', activationOp: 'ACTIVATE_SKILL' },
  orchestrator: { entity: 'orchestrator', version: 'orchestratorVersion', fk: 'orchestratorId', label: 'Orquestador', activationOp: 'ACTIVATE_ORCHESTRATOR' },
};

export interface VersionRow {
  id: string;
  version: number;
  status: string;
  definition: Prisma.JsonValue;
  checksum: string;
  changeNote: string;
  createdBy: string;
  createdAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  sourceProposalId: string | null;
}

export interface EntityRow {
  id: string;
  key: string;
  name: string;
  description: string;
  status: string;
  activeVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type AnyDelegate = {
  findUnique: (args: unknown) => Promise<any>;
  findFirst: (args: unknown) => Promise<any>;
  findMany: (args: unknown) => Promise<any[]>;
  create: (args: unknown) => Promise<any>;
  update: (args: unknown) => Promise<any>;
  updateMany: (args: unknown) => Promise<{ count: number }>;
};

/**
 * Catálogo versionado genérico. Reglas:
 * - Las versiones son inmutables salvo en DRAFT.
 * - Activar requiere una solicitud de aprobación (política ACTIVATE_*); nunca se activa directo.
 * - Una ejecución guarda la versión exacta usada, así que activar no altera ejecuciones existentes.
 */
export class CatalogService {
  constructor(private readonly core: Core) {}

  private db(tx?: Prisma.TransactionClient) {
    return (tx ?? this.core.deps.prisma) as unknown as Record<string, AnyDelegate>;
  }

  async index(): Promise<CatalogIndex> {
    const prisma = this.core.deps.prisma;
    const [agents, skills] = await Promise.all([
      prisma.agent.findMany({ include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, take: 1 } } }),
      prisma.skill.findMany({ select: { key: true, status: true } }),
    ]);
    return {
      agents: new Map(
        agents.map((a) => {
          const def = (a.activeVersion?.definition ?? a.versions[0]?.definition ?? {}) as { tasks?: string[] };
          return [a.key, { tasks: def.tasks ?? [], status: a.status }];
        }),
      ),
      skills: new Map(skills.filter((s) => s.status !== 'ARCHIVED').map((s) => [s.key, { status: s.status }])),
    };
  }

  async validate(kind: CatalogKind, definition: unknown, selfKey?: string): Promise<ValidationResult> {
    return validateDefinition(kind, definition, await this.index(), selfKey);
  }

  async list(kind: CatalogKind) {
    const m = KIND_META[kind];
    const rows = await this.db()[m.entity].findMany({
      orderBy: { key: 'asc' },
      include: { activeVersion: true, versions: { orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, createdAt: true } } },
    });
    return rows.map((r: EntityRow & { activeVersion: VersionRow | null; versions: Pick<VersionRow, 'id' | 'version' | 'status' | 'createdAt'>[] }) => ({
      ...r,
      latestVersion: r.versions[0] ?? null,
      pendingVersions: r.versions.filter((v) => v.status === 'PENDING_APPROVAL').length,
      draftVersions: r.versions.filter((v) => v.status === 'DRAFT').length,
    }));
  }

  async get(kind: CatalogKind, key: string) {
    const m = KIND_META[kind];
    const row = await this.db()[m.entity].findUnique({
      where: { key },
      include: { activeVersion: true, versions: { orderBy: { version: 'desc' } } },
    });
    if (!row) throw notFound(`${m.label} ${key}`);
    return row as EntityRow & { activeVersion: VersionRow | null; versions: VersionRow[] };
  }

  async getVersion(kind: CatalogKind, key: string, version: number): Promise<VersionRow & { entity: EntityRow & { activeVersion: VersionRow | null } }> {
    const entity = await this.get(kind, key);
    const v = entity.versions.find((x) => x.version === version);
    if (!v) throw notFound(`${KIND_META[kind].label} ${key} v${version}`);
    return { ...v, entity };
  }

  async getVersionById(kind: CatalogKind, id: string): Promise<VersionRow & { entityKey: string }> {
    const m = KIND_META[kind];
    const v = await this.db()[m.version].findUnique({ where: { id }, include: { [m.entity]: true } });
    if (!v) throw notFound(`Versión ${id}`);
    return { ...v, entityKey: v[m.entity].key };
  }

  private async assertValid(kind: CatalogKind, definition: unknown, key: string): Promise<ValidationResult> {
    const res = await this.validate(kind, definition, key);
    if (!res.valid) throw invalid(`Definición inválida: ${res.errors.join('; ')}`, { errors: res.errors, warnings: res.warnings });
    return res;
  }

  async create(
    kind: CatalogKind,
    key: string,
    definition: unknown,
    changeNote: string,
    actor: Actor,
    opts: { versionStatus?: 'DRAFT' | 'APPROVED'; sourceProposalId?: string; tx?: Prisma.TransactionClient } = {},
  ) {
    const m = KIND_META[kind];
    const existing = await this.db(opts.tx)[m.entity].findUnique({ where: { key } });
    if (existing) throw new PlatformError('VERSION_CONFLICT', `Ya existe ${m.label.toLowerCase()} con clave ${key}`);
    const res = await this.assertValid(kind, definition, key);
    const def = res.value as { name: string; description?: string };
    const run = async (tx: Prisma.TransactionClient) => {
      const entity = await this.db(tx)[m.entity].create({
        data: { key, name: def.name, description: def.description ?? '', status: 'DRAFT', createdBy: actor.id },
      });
      const version = await this.db(tx)[m.version].create({
        data: {
          [m.fk]: entity.id,
          version: 1,
          status: opts.versionStatus ?? 'DRAFT',
          definition: def,
          checksum: contentHash(def),
          changeNote,
          createdBy: actor.id,
          sourceProposalId: opts.sourceProposalId,
          approvedBy: opts.versionStatus === 'APPROVED' ? actor.id : undefined,
          approvedAt: opts.versionStatus === 'APPROVED' ? new Date() : undefined,
        },
      });
      await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_CREATED`, entityType: m.label, entityId: key, summary: `${m.label} ${key} creado (v1 ${version.status})`, data: { changeNote } }, tx);
      return { entity, version, warnings: res.warnings };
    };
    return opts.tx ? run(opts.tx) : this.core.deps.prisma.$transaction(run);
  }

  async createVersion(
    kind: CatalogKind,
    key: string,
    definition: unknown,
    changeNote: string,
    actor: Actor,
    opts: { versionStatus?: 'DRAFT' | 'APPROVED'; sourceProposalId?: string; tx?: Prisma.TransactionClient } = {},
  ) {
    const m = KIND_META[kind];
    const res = await this.assertValid(kind, definition, key);
    const run = async (tx: Prisma.TransactionClient) => {
      const entity = await this.db(tx)[m.entity].findUnique({ where: { key } });
      if (!entity) throw notFound(`${m.label} ${key}`);
      const last = await this.db(tx)[m.version].findFirst({ where: { [m.fk]: entity.id }, orderBy: { version: 'desc' } });
      const version = await this.db(tx)[m.version].create({
        data: {
          [m.fk]: entity.id,
          version: (last?.version ?? 0) + 1,
          status: opts.versionStatus ?? 'DRAFT',
          definition: res.value,
          checksum: contentHash(res.value),
          changeNote,
          createdBy: actor.id,
          sourceProposalId: opts.sourceProposalId,
          approvedBy: opts.versionStatus === 'APPROVED' ? actor.id : undefined,
          approvedAt: opts.versionStatus === 'APPROVED' ? new Date() : undefined,
        },
      });
      await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_VERSION_CREATED`, entityType: m.label, entityId: key, summary: `${m.label} ${key} v${version.version} (${version.status})`, data: { changeNote } }, tx);
      return { version, warnings: res.warnings };
    };
    return opts.tx ? run(opts.tx) : this.core.deps.prisma.$transaction(run);
  }

  /** Solo los borradores son editables. */
  async updateDraft(kind: CatalogKind, key: string, versionNumber: number, definition: unknown, changeNote: string, actor: Actor) {
    const m = KIND_META[kind];
    const v = await this.getVersion(kind, key, versionNumber);
    if (v.status !== 'DRAFT') throw new PlatformError('VERSION_CONFLICT', `Solo se editan borradores; v${versionNumber} está ${v.status}. Creá una nueva versión.`);
    const res = await this.assertValid(kind, definition, key);
    const updated = await this.db()[m.version].update({
      where: { id: v.id },
      data: { definition: res.value, checksum: contentHash(res.value), changeNote: changeNote || v.changeNote },
    });
    const def = res.value as { name: string; description?: string };
    if (v.entity.status === 'DRAFT') await this.db()[m.entity].update({ where: { id: v.entity.id }, data: { name: def.name, description: def.description ?? '' } });
    await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_DRAFT_EDITED`, entityType: m.label, entityId: key, summary: `Borrador ${key} v${versionNumber} editado` });
    return { version: updated, warnings: res.warnings };
  }

  /** Pide activar una versión: crea la solicitud de aprobación con snapshot inmutable. */
  async requestActivation(kind: CatalogKind, key: string, versionNumber: number, actor: Actor) {
    const m = KIND_META[kind];
    const v = await this.getVersion(kind, key, versionNumber);
    if (!['DRAFT', 'APPROVED', 'INACTIVE'].includes(v.status)) {
      throw new PlatformError('VERSION_CONFLICT', `La versión ${versionNumber} está ${v.status}; no se puede solicitar su activación.`);
    }
    // Revalidación con el catálogo actual (las referencias pueden haber cambiado).
    await this.assertValid(kind, v.definition, key);
    await this.db()[m.version].update({ where: { id: v.id }, data: { status: 'PENDING_APPROVAL' } });
    try {
      return await this.core.approvals.createActivationRequest({
        kind,
        operationType: m.activationOp,
        key,
        versionId: v.id,
        versionNumber,
        checksum: v.checksum,
        definition: v.definition,
        previousActive: v.entity.activeVersion ? { version: v.entity.activeVersion.version, definition: v.entity.activeVersion.definition } : null,
        actor,
      });
    } catch (err) {
      // Sin solicitud (p. ej. política DENIED) la versión no puede quedar esperando una aprobación que no existe.
      await this.db()[m.version].update({ where: { id: v.id }, data: { status: v.status } });
      throw err;
    }
  }

  /** Aplicada por el motor de aprobaciones cuando la activación fue aprobada. */
  async applyActivation(kind: CatalogKind, versionId: string, expectedChecksum: string, approver: Actor, tx: Prisma.TransactionClient) {
    const m = KIND_META[kind];
    const v = await this.db(tx)[m.version].findUnique({ where: { id: versionId } });
    if (!v) throw notFound(`Versión ${versionId}`);
    if (v.checksum !== expectedChecksum) throw new PlatformError('VERSION_CONFLICT', 'La versión cambió después de solicitar la aprobación; pedí una nueva aprobación.');
    const entityId = v[m.fk];
    await this.db(tx)[m.version].updateMany({ where: { [m.fk]: entityId, status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
    await this.db(tx)[m.version].update({
      where: { id: versionId },
      data: { status: 'ACTIVE', activatedAt: new Date(), approvedBy: v.approvedBy ?? approver.id, approvedAt: v.approvedAt ?? new Date() },
    });
    const def = v.definition as { name: string; description?: string };
    const entity = await this.db(tx)[m.entity].update({
      where: { id: entityId },
      data: { activeVersionId: versionId, status: 'ACTIVE', name: def.name, description: def.description ?? '' },
    });
    await this.core.audit.record({ actor: approver, action: `${kind.toUpperCase()}_ACTIVATED`, entityType: m.label, entityId: entity.key, summary: `${m.label} ${entity.key} v${v.version} activado` }, tx);
    return entity;
  }

  async rejectActivation(kind: CatalogKind, versionId: string, actor: Actor, tx: Prisma.TransactionClient) {
    const m = KIND_META[kind];
    const v = await this.db(tx)[m.version].findUnique({ where: { id: versionId } });
    if (!v || v.status !== 'PENDING_APPROVAL') return;
    // Si venía de una propuesta aprobada vuelve a APPROVED; si no, queda rechazada.
    await this.db(tx)[m.version].update({ where: { id: versionId }, data: { status: v.approvedAt ? 'APPROVED' : 'REJECTED' } });
    await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_ACTIVATION_REJECTED`, entityType: m.label, entityId: versionId, summary: `Activación rechazada (v${v.version})` }, tx);
  }

  async deactivate(kind: CatalogKind, key: string, actor: Actor, txIn?: Prisma.TransactionClient) {
    const m = KIND_META[kind];
    if (kind === 'agent' && key === 'MainSupervisor') throw new PlatformError('AUTHORIZATION_ERROR', 'El supervisor principal no puede desactivarse.');
    const run = async (tx: Prisma.TransactionClient) => {
      const entity = await this.db(tx)[m.entity].findUnique({ where: { key } });
      if (!entity) throw notFound(`${m.label} ${key}`);
      if (entity.activeVersionId) await this.db(tx)[m.version].update({ where: { id: entity.activeVersionId }, data: { status: 'INACTIVE' } });
      const row = await this.db(tx)[m.entity].update({ where: { id: entity.id }, data: { status: 'INACTIVE', activeVersionId: null } });
      await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_DEACTIVATED`, entityType: m.label, entityId: key, summary: `${m.label} ${key} desactivado` }, tx);
      return row;
    };
    // Dentro de otra transacción (propuesta de cancelación) el archivo lo actualiza el hook de aprobaciones.
    if (txIn) return run(txIn);
    const row = await this.core.deps.prisma.$transaction(run);
    await this.core.catalogSync.exportAfterChange(actor, [kind], [key]);
    return row;
  }

  async archiveVersion(kind: CatalogKind, key: string, versionNumber: number, actor: Actor) {
    const m = KIND_META[kind];
    const v = await this.getVersion(kind, key, versionNumber);
    if (v.status === 'ACTIVE') throw new PlatformError('VERSION_CONFLICT', 'No se puede archivar la versión activa');
    await this.db()[m.version].update({ where: { id: v.id }, data: { status: 'ARCHIVED' } });
    await this.core.audit.record({ actor, action: `${kind.toUpperCase()}_VERSION_ARCHIVED`, entityType: m.label, entityId: key, summary: `${key} v${versionNumber} archivada` });
  }

  async duplicate(kind: CatalogKind, key: string, newKey: string, actor: Actor) {
    const entity = await this.get(kind, key);
    const source = entity.activeVersion ?? entity.versions[0];
    const def = { ...(source.definition as Record<string, unknown>) };
    def.name = `${String(def.name)} (copia)`;
    return this.create(kind, newKey, def, `Duplicado de ${key} v${source.version}`, actor);
  }

  /** Restaurar = nuevo borrador con el contenido de una versión anterior (no reescribe la historia). */
  async restore(kind: CatalogKind, key: string, versionNumber: number, actor: Actor) {
    const v = await this.getVersion(kind, key, versionNumber);
    return this.createVersion(kind, key, v.definition, `Restaurado desde v${versionNumber}`, actor);
  }

  async diff(kind: CatalogKind, key: string, from: number, to: number) {
    const [a, b] = await Promise.all([this.getVersion(kind, key, from), this.getVersion(kind, key, to)]);
    return { from: { version: a.version, status: a.status, checksum: a.checksum }, to: { version: b.version, status: b.status, checksum: b.checksum }, lines: diffJson(a.definition, b.definition) };
  }

  /** Versiones activas (para el snapshot de una ejecución). */
  async activeDefinitions() {
    const prisma = this.core.deps.prisma;
    const [agents, skills] = await Promise.all([
      prisma.agent.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
      prisma.skill.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
    ]);
    return {
      agents: agents.filter((a) => a.activeVersion).map((a) => ({ key: a.key, versionId: a.activeVersion!.id, version: a.activeVersion!.version, checksum: a.activeVersion!.checksum })),
      skills: skills.filter((s) => s.activeVersion).map((s) => ({ key: s.key, versionId: s.activeVersion!.id, version: s.activeVersion!.version, checksum: s.activeVersion!.checksum })),
    };
  }
}
