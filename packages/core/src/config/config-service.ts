import { globalConfigSchema, projectConfigSchema, type GlobalConfig, type ProjectConfig } from '@mao/shared';
import type { Prisma } from '@mao/db';
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

    // No inventar campos de Jira: si hay campos descubiertos, los mapeos deben referirse a ellos.
    const discovered = cfg.jira.discovered;
    if (discovered) {
      const ids = new Set(discovered.fields.map((f) => f.id));
      const unknown = cfg.jira.customFields.filter((f) => !ids.has(f.fieldId)).map((f) => f.fieldId);
      if (cfg.storyPoints.fieldId && !ids.has(cfg.storyPoints.fieldId)) unknown.push(cfg.storyPoints.fieldId);
      if (unknown.length) throw invalid(`Campos no descubiertos en Jira: ${unknown.join(', ')}. Ejecutá el descubrimiento de campos primero.`);
    } else if (cfg.jira.customFields.length || cfg.storyPoints.fieldId) {
      throw invalid('Los campos personalizados se mapean solo después de descubrirlos con el conector.');
    }

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
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Configuración activa del proyecto leída dentro de una transacción. */
  async activeProjectConfigTx(projectId: string, tx: Prisma.TransactionClient) {
    const row = await tx.projectConfiguration.findFirst({ where: { projectId, status: 'ACTIVE' }, orderBy: { version: 'desc' } });
    if (!row) throw new PlatformError('NOT_FOUND', 'El proyecto no tiene configuración activa');
    return row;
  }
}
