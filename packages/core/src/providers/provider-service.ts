import type { Core } from '../core';
import type { Actor } from '../context';
import { notFound } from '../util/errors';
import { createProvider } from './registry';

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

  async update(key: string, patch: { enabled?: boolean; isDefault?: boolean; config?: Record<string, unknown> }, actor: Actor) {
    const prisma = this.core.deps.prisma;
    const cfg = await prisma.modelProviderConfiguration.findUnique({ where: { key } });
    if (!cfg) throw notFound(`Proveedor ${key}`);
    // La configuración nunca guarda secretos: se descartan claves con forma de credencial.
    const config = patch.config ? Object.fromEntries(Object.entries(patch.config).filter(([k]) => !/key$|token|secret|password/i.test(k) || k === 'apiKeyEnv')) : undefined;
    const row = await prisma.$transaction(async (tx) => {
      if (patch.isDefault) await tx.modelProviderConfiguration.updateMany({ data: { isDefault: false } });
      return tx.modelProviderConfiguration.update({ where: { key }, data: { enabled: patch.enabled, isDefault: patch.isDefault, config: config ? ({ ...(cfg.config as object), ...config } as object) : undefined } });
    });
    await this.core.audit.record({ actor, action: 'PROVIDER_UPDATED', entityType: 'ModelProvider', entityId: key, summary: `Proveedor ${key} actualizado`, data: patch });
    return row;
  }
}
