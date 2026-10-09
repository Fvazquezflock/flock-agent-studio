import type { ProviderKind } from '@mao/shared';
import type { Core } from '../core';
import type { Actor } from '../context';
import { withoutSecretConfig } from '../config/config-format';
import { PlatformError, invalid, notFound } from '../util/errors';
import { createProvider } from './registry';

const PROVIDER_KEY_RE = /^[a-z][a-z0-9-]{1,39}$/;

export class ProviderService {
  constructor(private readonly core: Core) {}

  list() {
    return this.core.deps.prisma.modelProviderConfiguration.findMany({ orderBy: { key: 'asc' } });
  }

  async diagnose(key: string, deep: boolean, actor: Actor) {
    const prisma = this.core.deps.prisma;
    const cfg = await prisma.modelProviderConfiguration.findUnique({ where: { key } });
    if (!cfg) throw notFound(`Proveedor ${key}`);
    const diagnosis = await createProvider(cfg, this.core.deps).diagnose(deep);
    const row = await prisma.modelProviderConfiguration.update({ where: { key }, data: { status: diagnosis.status, lastCheckedAt: new Date(), lastDiagnosis: diagnosis as object } });
    await this.core.audit.record({ actor, action: 'PROVIDER_DIAGNOSED', entityType: 'ModelProvider', entityId: key, summary: `Diagnóstico ${key}: ${diagnosis.status}` });
    return row;
  }

  /**
   * Cambia un proveedor. La configuración nunca guarda secretos: se descartan claves con forma de credencial.
   * Por defecto la configuración se combina con la actual; con `replaceConfig` la reemplaza (archivos de catalog/).
   */
  async update(key: string, patch: { name?: string; enabled?: boolean; isDefault?: boolean; config?: Record<string, unknown> }, actor: Actor, opts: { replaceConfig?: boolean } = {}) {
    const prisma = this.core.deps.prisma;
    const cfg = await prisma.modelProviderConfiguration.findUnique({ where: { key } });
    if (!cfg) throw notFound(`Proveedor ${key}`);
    const config = patch.config ? withoutSecretConfig(patch.config) : undefined;
    const next = config ? (opts.replaceConfig ? config : { ...(cfg.config as object), ...config }) : undefined;
    const row = await prisma.$transaction(async (tx) => {
      if (patch.isDefault) await tx.modelProviderConfiguration.updateMany({ data: { isDefault: false } });
      return tx.modelProviderConfiguration.update({ where: { key }, data: { name: patch.name || undefined, enabled: patch.enabled, isDefault: patch.isDefault, config: next as object | undefined } });
    });
    await this.core.audit.record({ actor, action: 'PROVIDER_UPDATED', entityType: 'ModelProvider', entityId: key, summary: `Proveedor ${key} actualizado`, data: patch });
    await this.core.configFiles.exportAfterChange(actor);
    return row;
  }

  /** Nuevo proveedor (p. ej. desde catalog/providers.yaml). Sin secretos en la configuración. */
  async create(input: { key: string; name: string; kind: ProviderKind; enabled?: boolean; isDefault?: boolean; config?: Record<string, unknown> }, actor: Actor) {
    const prisma = this.core.deps.prisma;
    if (!PROVIDER_KEY_RE.test(input.key)) throw invalid(`Clave de proveedor inválida "${input.key}": minúsculas, números y guiones (2 a 40 caracteres)`);
    if (!input.name?.trim()) throw invalid('El proveedor requiere un nombre');
    if (await prisma.modelProviderConfiguration.findUnique({ where: { key: input.key } })) throw new PlatformError('VERSION_CONFLICT', `Ya existe el proveedor ${input.key}`);
    const config = withoutSecretConfig(input.config ?? {});
    const row = await prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.modelProviderConfiguration.updateMany({ data: { isDefault: false } });
      return tx.modelProviderConfiguration.create({ data: { key: input.key, name: input.name, kind: input.kind, enabled: input.enabled ?? true, isDefault: input.isDefault ?? false, config: config as object } });
    });
    await this.core.audit.record({ actor, action: 'PROVIDER_CREATED', entityType: 'ModelProvider', entityId: input.key, summary: `Proveedor ${input.key} creado (${input.kind})`, data: { ...input, config } });
    await this.core.configFiles.exportAfterChange(actor);
    return row;
  }
}
