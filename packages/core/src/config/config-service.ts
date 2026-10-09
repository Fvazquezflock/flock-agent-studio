import { ENTITY_STATUSES, globalConfigSchema, projectConfigSchema, projectCreateRequest, projectUpdateRequest, type EntityStatus, type GlobalConfig, type ProjectConfig } from '@mao/shared';
import type { Prisma } from '@mao/db';
import { z } from 'zod';
import type { Core } from '../core';
import type { Actor } from '../context';
import { contentHash } from '../util/hash';
import { PlatformError, invalid, notFound } from '../util/errors';
import { deepMerge } from '../util/merge';

const GLOBAL_KEY = 'global.config';

/** Claves de configuración que una operación puede especializar. La seguridad nunca. */
export const OPERATION_OVERRIDABLE_KEYS = ['templates', 'rules', 'storyPoints', 'definitionOfReady', 'definitionOfDone'] as const;

/**
 * Herencia Configuración global → Proyecto → Operación.
 * Las reglas obligatorias de seguridad viven en GlobalConfig.security.mandatory y no se pueden sobrescribir.
 */
export function resolveConfig(global: GlobalConfig, project: unknown, operation?: Record<string, unknown>): { config: ProjectConfig; ignored: string[] } {
  const ignored: string[] = [];
  const opOverrides: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(operation ?? {})) {
    if ((OPERATION_OVERRIDABLE_KEYS as readonly string[]).includes(k)) opOverrides[k] = v;
    else ignored.push(k);
  }
  const merged = deepMerge(deepMerge(global.defaults ?? {}, project ?? {}), opOverrides);
  return { config: projectConfigSchema.parse(merged), ignored };
}

/** No inventar campos de Jira: si hay campos descubiertos, los mapeos deben referirse a ellos. */
export function checkJiraFields(cfg: ProjectConfig) {
  const discovered = cfg.jira.discovered;
  if (discovered) {
    const ids = new Set(discovered.fields.map((f) => f.id));
    const unknown = cfg.jira.customFields.filter((f) => !ids.has(f.fieldId)).map((f) => f.fieldId);
    if (cfg.storyPoints.fieldId && !ids.has(cfg.storyPoints.fieldId)) unknown.push(cfg.storyPoints.fieldId);
    if (unknown.length) throw invalid(`Campos no descubiertos en Jira: ${unknown.join(', ')}. Ejecutá el descubrimiento de campos primero.`);
  } else if (cfg.jira.customFields.length || cfg.storyPoints.fieldId) {
    throw invalid('Los campos personalizados se mapean solo después de descubrirlos con el conector.');
  }
}

/** Alta de proyecto (API, CLI, UI o catalog/projects/<CLAVE>.yaml). */
export type ProjectCreateInput = Omit<z.input<typeof projectCreateRequest>, 'connectionKey' | 'providerKey'> & { status?: EntityStatus; connectionKey?: string | null; providerKey?: string | null };
/** Cambio de metadatos. `null` en connectionKey / providerKey quita la conexión o el proveedor por defecto. */
export type ProjectUpdateInput = Omit<z.input<typeof projectUpdateRequest>, 'connectionKey' | 'providerKey'> & { connectionKey?: string | null; providerKey?: string | null };

const issuesOf = (err: z.ZodError) => err.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);

export class ConfigService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  async getGlobal(): Promise<{ config: GlobalConfig; version: number }> {
    const row = await this.prisma.globalSetting.findUnique({ where: { key: GLOBAL_KEY } });
    return { config: globalConfigSchema.parse(row?.value ?? {}), version: row?.version ?? 0 };
  }

  async setGlobal(value: unknown, actor: Actor) {
    const parsed = globalConfigSchema.safeParse(value);
    if (!parsed.success) throw invalid('Configuración global inválida', { issues: parsed.error.issues });
    const current = await this.prisma.globalSetting.findUnique({ where: { key: GLOBAL_KEY } });
    const version = (current?.version ?? 0) + 1;
    const row = await this.prisma.globalSetting.upsert({
      where: { key: GLOBAL_KEY },
      create: { key: GLOBAL_KEY, value: parsed.data as object, version, updatedBy: actor.id },
      update: { value: parsed.data as object, version, updatedBy: actor.id },
    });
    await this.core.audit.record({ actor, action: 'GLOBAL_CONFIG_CHANGED', entityType: 'GlobalSetting', entityId: GLOBAL_KEY, summary: `Configuración global v${version}`, data: parsed.data });
    await this.core.configFiles.exportAfterChange(actor);
    return row;
  }

  async activeProjectConfig(projectId: string) {
    const row = await this.prisma.projectConfiguration.findFirst({ where: { projectId, status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (!row) throw new PlatformError('NOT_FOUND', 'El proyecto no tiene configuración activa');
    return row;
  }

  async resolvedForProject(projectId: string, operation?: Record<string, unknown>) {
    const [global, row] = await Promise.all([this.getGlobal(), this.activeProjectConfig(projectId)]);
    const { config, ignored } = resolveConfig(global.config, row.config, operation);
    return { config, configRow: row, global: global.config, globalVersion: global.version, ignored };
  }

  /** Crea una nueva versión de la configuración del proyecto (la anterior queda INACTIVE). Con `tx`, dentro de esa transacción. */
  async saveProjectConfig(projectKey: string, value: unknown, changeNote: string, actor: Actor, tx?: Prisma.TransactionClient) {
    const project = await (tx ?? this.prisma).project.findUnique({ where: { key: projectKey } });
    if (!project) throw notFound(`Proyecto ${projectKey}`);
    const parsed = projectConfigSchema.safeParse(value);
    if (!parsed.success) throw invalid('Configuración de proyecto inválida', { issues: parsed.error.issues });
    const cfg = parsed.data;
    checkJiraFields(cfg);

    const run = async (tx: Prisma.TransactionClient) => {
      const last = await tx.projectConfiguration.findFirst({ where: { projectId: project.id }, orderBy: { version: 'desc' } });
      const version = (last?.version ?? 0) + 1;
      await tx.projectConfiguration.updateMany({ where: { projectId: project.id, status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
      const row = await tx.projectConfiguration.create({
        data: { projectId: project.id, version, status: 'ACTIVE', config: cfg as object, checksum: contentHash(cfg), changeNote, createdBy: actor.id },
      });
      await this.core.audit.record(
        { actor, action: 'PROJECT_CONFIG_CHANGED', entityType: 'ProjectConfiguration', entityId: row.id, projectId: project.id, summary: `Configuración de ${projectKey} v${version}: ${changeNote || 'sin nota'}` },
        tx,
      );
      return row;
    };
    // Con `tx`, quien confirma la transacción exporta los archivos (p. ej. el servicio de aprobaciones).
    if (tx) return run(tx);
    const row = await this.prisma.$transaction(run);
    await this.core.configFiles.exportAfterChange(actor);
    return row;
  }

  /** Configuración activa del proyecto leída dentro de una transacción. */
  async activeProjectConfigTx(projectId: string, tx: Prisma.TransactionClient) {
    const row = await tx.projectConfiguration.findFirst({ where: { projectId, status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (!row) throw new PlatformError('NOT_FOUND', 'El proyecto no tiene configuración activa');
    return row;
  }

  private async connectionByKey(key: string) {
    const c = await this.prisma.connection.findUnique({ where: { key } });
    if (!c) throw notFound(`Conexión ${key}`);
    return c;
  }

  private async providerByKey(key: string) {
    const p = await this.prisma.modelProviderConfiguration.findUnique({ where: { key } });
    if (!p) throw notFound(`Proveedor ${key}`);
    return p;
  }

  /**
   * Crea un proyecto con su configuración v1 ACTIVE: la indicada (archivo de catalog/) o la heredada de la global.
   * Un proyecto en modo JIRA requiere una conexión.
   */
  async createProject(input: ProjectCreateInput, actor: Actor, opts: { config?: unknown; changeNote?: string } = {}) {
    const parsed = projectCreateRequest.safeParse({ ...input, connectionKey: input.connectionKey ?? undefined, providerKey: input.providerKey ?? undefined });
    if (!parsed.success) throw invalid('Proyecto inválido', { issues: issuesOf(parsed.error) });
    const body = parsed.data;
    const status = input.status ?? 'ACTIVE';
    if (!(ENTITY_STATUSES as readonly string[]).includes(status)) throw invalid(`Estado de proyecto inválido: ${status}`);
    if (await this.prisma.project.findUnique({ where: { key: body.key } })) throw new PlatformError('VERSION_CONFLICT', `Ya existe el proyecto ${body.key}`);
    const connection = body.connectionKey ? await this.connectionByKey(body.connectionKey) : null;
    if (body.mode === 'JIRA' && !connection) throw new PlatformError('VALIDATION_ERROR', 'Un proyecto en modo JIRA requiere una conexión');
    const provider = body.providerKey ? await this.providerByKey(body.providerKey) : null;

    let config: ProjectConfig;
    if (opts.config !== undefined) {
      const cfg = projectConfigSchema.safeParse(opts.config);
      if (!cfg.success) throw invalid('Configuración de proyecto inválida', { issues: cfg.error.issues });
      checkJiraFields(cfg.data);
      config = cfg.data;
    } else {
      const { config: global } = await this.getGlobal();
      config = projectConfigSchema.parse(global.defaults ?? {});
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: { key: body.key, name: body.name, description: body.description, jiraProjectKey: body.jiraProjectKey, mode: body.mode, status, connectionId: connection?.id, defaultProviderId: provider?.id },
      });
      await tx.projectConfiguration.create({
        data: { projectId: p.id, version: 1, status: 'ACTIVE', config: config as object, checksum: contentHash(config), changeNote: opts.changeNote ?? 'Configuración inicial heredada de la global', createdBy: actor.id },
      });
      await this.core.audit.record({ actor, action: 'PROJECT_CREATED', entityType: 'Project', entityId: p.key, projectId: p.id, summary: `Proyecto ${p.key} creado (${p.mode})` }, tx);
      return p;
    });
    await this.core.configFiles.exportAfterChange(actor);
    return project;
  }

  /** Cambia metadatos del proyecto (nombre, modo, estado, conexión, proveedor por defecto). */
  async updateProject(key: string, input: ProjectUpdateInput, actor: Actor) {
    const parsed = projectUpdateRequest.safeParse({ ...input, connectionKey: input.connectionKey ?? undefined, providerKey: input.providerKey ?? undefined });
    if (!parsed.success) throw invalid('Datos del proyecto inválidos', { issues: issuesOf(parsed.error) });
    // projectUpdateRequest es `.partial()` de un esquema con valores por defecto y Zod 4 los sigue aplicando
    // (mode 'DEMO', description ''): solo cuentan las claves que vinieron en el pedido.
    const sent = (k: string) => (input as Record<string, unknown>)[k] !== undefined;
    const body = Object.fromEntries(Object.entries(parsed.data).filter(([k]) => sent(k))) as typeof parsed.data;
    const project = await this.prisma.project.findUnique({ where: { key } });
    if (!project) throw new PlatformError('NOT_FOUND', `Proyecto ${key} no encontrado`);
    // undefined: sin cambios; null: quitar.
    const connectionId = input.connectionKey === null ? null : body.connectionKey ? (await this.connectionByKey(body.connectionKey)).id : undefined;
    const defaultProviderId = input.providerKey === null ? null : body.providerKey ? (await this.providerByKey(body.providerKey)).id : undefined;
    const nextConnection = connectionId === undefined ? project.connectionId : connectionId;
    if ((body.mode ?? project.mode) === 'JIRA' && !nextConnection) throw new PlatformError('VALIDATION_ERROR', 'Un proyecto en modo JIRA requiere una conexión');
    const updated = await this.prisma.project.update({
      where: { key },
      data: { name: body.name, description: body.description, jiraProjectKey: body.jiraProjectKey, mode: body.mode, status: body.status, connectionId, defaultProviderId },
    });
    await this.core.audit.record({ actor, action: 'PROJECT_UPDATED', entityType: 'Project', entityId: key, projectId: project.id, summary: `Proyecto ${key} actualizado`, data: input });
    await this.core.configFiles.exportAfterChange(actor);
    return updated;
  }
}
