import { contentHash, Core, ownerActor, seedDatabase, type CoreDeps } from '../../src/index';
import type { Prisma } from '@mao/db';

let seeded = false;

/** Core sobre la base de prueba, con la carga inicial aplicada una vez por proceso. */
export async function testCore(overrides: Partial<CoreDeps> = {}): Promise<Core> {
  if (process.env.MAO_USE_TEST_DB !== '1') throw new Error('Las pruebas de integración requieren MAO_USE_TEST_DB=1');
  const core = new Core({ ownerName: 'Propietario de prueba', ...overrides });
  if (!seeded) {
    await seedDatabase(core);
    seeded = true;
  }
  return core;
}

export const actor = (core: Core, channel = 'UI') => ownerActor(core.deps, channel);

/** Aprueba todo lo pendiente respetando la política: individuales de a uno, el resto por lote. */
export async function approveAll(core: Core, requestId: string, channel = 'UI') {
  let req = await core.approvals.get(requestId);
  for (const i of req.items.filter((x) => x.status === 'PENDING' && x.policyMode === 'ALWAYS_APPROVE')) {
    req = await core.approvals.get(requestId);
    await core.approvals.decide(requestId, { approve: [i.id], reject: [], comment: 'prueba', channel, confirmHash: req.decisionHash.slice(0, 12) }, actor(core, channel));
  }
  req = await core.approvals.get(requestId);
  const batch = req.items.filter((x) => x.status === 'PENDING');
  if (batch.length) await core.approvals.decide(requestId, { approve: batch.map((b) => b.id), reject: [], comment: 'lote', channel, confirmHash: req.decisionHash.slice(0, 12) }, actor(core, channel));
  return core.approvals.get(requestId);
}

/** Corre el motor hasta que la ejecución no tenga trabajo inmediato (esperando reintentos cortos). */
export async function runToRest(core: Core, executionId: string, maxMs = 30_000) {
  const end = Date.now() + maxMs;
  for (;;) {
    await core.engine.runUntilIdle('test-worker');
    const ex = await core.deps.prisma.execution.findUniqueOrThrow({ where: { id: executionId } });
    if (ex.status !== 'RETRYING' && ex.status !== 'PENDING' && ex.status !== 'RUNNING') return ex;
    if (Date.now() > end) return ex;
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Solo pruebas: instala una versión ACTIVA directamente (sin flujo de aprobación). */
export async function installActive(core: Core, kind: 'orchestrator' | 'agent' | 'skill', key: string, definition: Record<string, unknown>) {
  const prisma = core.deps.prisma as unknown as Record<string, any>;
  const entity = kind;
  const versionModel = `${kind}Version`;
  const fk = `${kind}Id`;
  return core.deps.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const t = tx as unknown as Record<string, any>;
    let e = await t[entity].findUnique({ where: { key } });
    if (!e) e = await t[entity].create({ data: { key, name: String(definition.name), status: 'ACTIVE', createdBy: 'test' } });
    const last = await t[versionModel].findFirst({ where: { [fk]: e.id }, orderBy: { version: 'desc' } });
    await t[versionModel].updateMany({ where: { [fk]: e.id, status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
    const v = await t[versionModel].create({ data: { [fk]: e.id, version: (last?.version ?? 0) + 1, status: 'ACTIVE', definition, checksum: contentHash(definition), createdBy: 'test' } });
    await t[entity].update({ where: { id: e.id }, data: { activeVersionId: v.id, status: 'ACTIVE' } });
    void prisma;
    return v;
  });
}
