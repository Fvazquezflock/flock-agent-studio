import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { Core, DemoJiraGateway } from '../../src/index';
import { FakeLiveJira } from './fake-jira';
import { actor, approveAll, runToRest, testCore } from './helpers';

const fake = new FakeLiveJira();
let core: Core;

/** Proyecto en modo JIRA conectado al Jira simulado "real" (para ejercitar el camino de escritura). */
async function ensureLiveProject(c: Core, writeEnabled: boolean) {
  const prisma = c.deps.prisma;
  await prisma.connection.update({ where: { key: 'jira-mcp' }, data: { writeEnabled } });
  const exists = await prisma.project.findUnique({ where: { key: 'LIVE' } });
  if (exists) return exists;
  const demo = await prisma.project.findUniqueOrThrow({ where: { key: 'DEMO' }, include: { configurations: { where: { status: 'ACTIVE' } } } });
  const conn = await prisma.connection.findUniqueOrThrow({ where: { key: 'jira-mcp' } });
  return prisma.project.create({
    data: {
      key: 'LIVE',
      name: 'Proyecto conectado (Jira simulado)',
      jiraProjectKey: 'DEMO',
      mode: 'JIRA',
      connectionId: conn.id,
      defaultProviderId: demo.defaultProviderId,
      configurations: { create: { version: 1, status: 'ACTIVE', config: demo.configurations[0].config as object, checksum: demo.configurations[0].checksum, createdBy: 'test' } },
    },
  });
}

beforeAll(async () => {
  core = await testCore({ gatewayFactory: ({ project }) => (project.mode === 'JIRA' ? fake : new DemoJiraGateway()), allowJiraWrites: true });
});
afterAll(async () => {
  await core.close();
  await disconnectPrisma();
});

describe('escrituras protegidas por el backend', () => {
  it('rechaza publicar ítems no aprobados, editados después de aprobar o sin escritura habilitada', async () => {
    await ensureLiveProject(core, false);
    const ex = await core.engine.createExecution({ projectKey: 'LIVE', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const task = req.items.find((i) => i.operationType === 'CREATE_ISSUE')!;
    const ctx = { executionId: ex.id, executionNumber: ex.number, projectId: ex.projectId, orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', correlationId: ex.id, config: (ex.snapshot as any).config, gateway: fake, created: new Map<string, string>(), writeEnabled: true };

    // 1) Pendiente: bloqueado.
    let r = await core.publication.publishItem(task, ctx);
    expect(r.status).toBe('BLOCKED');
    expect(r.message).toMatch(/no está aprobado/);

    // 2) Aprobado pero con el contenido alterado en la base: bloqueado por hash.
    await core.approvals.decide(req.id, { approve: [task.id], reject: [], comment: '', channel: 'UI', confirmHash: req.decisionHash.slice(0, 12) }, actor(core));
    const approved = await core.deps.prisma.approvalItem.findUniqueOrThrow({ where: { id: task.id } });
    const tampered = { ...approved, payload: { ...(approved.payload as object), summary: 'Cambio no aprobado' } };
    r = await core.publication.publishItem(tampered, ctx);
    expect(r.status).toBe('BLOCKED');

    // 3) Aprobado e intacto, pero la conexión no habilita escritura: bloqueado.
    r = await core.publication.publishItem(approved, { ...ctx, writeEnabled: false });
    expect(r.status).toBe('BLOCKED');
    expect(r.message).toMatch(/no está habilitada/);
    expect(fake.creates).toBe(0);

    // 4) Editar un ítem aprobado invalida la aprobación.
    const edited = await core.approvals.editItem(req.id, task.id, { summary: '[FE] Título editado' }, 'ajuste', actor(core));
    expect(edited.status).toBe('PENDING');
    expect(edited.revision).toBe(2);
    expect(edited.approvedHash).toBeNull();

    const audit = await core.audit.list({ action: 'WRITE_REJECTED', executionId: ex.id });
    expect(audit.length).toBeGreaterThanOrEqual(3);
  });

  it('con la escritura deshabilitada, la publicación termina bloqueada y no escribe nada', async () => {
    await ensureLiveProject(core, false);
    const ex = await core.engine.createExecution({ projectKey: 'LIVE', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    await approveAll(core, (await core.engine.get(ex.id)).approvalRequests[0].id);
    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('COMPLETED');
    expect((state.output as any).publication.blocked).toBeGreaterThan(0);
    expect((state.output as any).hasErrors).toBe(true);
    expect(fake.creates).toBe(0);
    expect(fake.updates).toBe(0);
  });

  it('una política DENIED vigente bloquea operaciones ya aprobadas', async () => {
    await ensureLiveProject(core, true);
    const ex = await core.engine.createExecution({ projectKey: 'LIVE', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    await approveAll(core, (await core.engine.get(ex.id)).approvalRequests[0].id);
    const policy = await core.policies.upsert({ scope: 'PROJECT', projectKey: 'LIVE', operationType: 'CREATE_ISSUE', mode: 'DENIED', mandatory: false, description: 'prueba', rules: {} }, actor(core));
    const before = fake.creates;
    const state = await runToRest(core, ex.id);
    const results = (state.output as any).publication.results as any[];
    expect(results.filter((x) => x.operationType === 'CREATE_ISSUE').every((x) => x.status === 'BLOCKED')).toBe(true);
    expect(fake.creates).toBe(before);
    await core.deps.prisma.approvalPolicy.update({ where: { id: policy.id }, data: { status: 'INACTIVE' } });
  });

  it('las decisiones exigen el hash vigente y la CLI no puede decidir sin confirmación', async () => {
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'CLI' }, actor(core, 'CLI'));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const one = req.items.find((i) => i.policyMode === 'BATCH_APPROVAL')!;
    await expect(core.approvals.decide(req.id, { approve: [one.id], reject: [], comment: '', channel: 'CLI' }, actor(core, 'CLI'))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(core.approvals.decide(req.id, { approve: [one.id], reject: [], comment: '', channel: 'CLI', confirmHash: 'deadbeef0000' }, actor(core, 'CLI'))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    // Rechazar un ítem rechaza en cascada lo que depende de él (vínculos).
    const res = await core.approvals.decide(req.id, { approve: [], reject: [one.id], comment: 'no', channel: 'CLI', confirmHash: req.decisionHash.slice(0, 12) }, actor(core, 'CLI'));
    expect(res.decision.decision).toBe('REJECT');
  });

  it('los deletes están prohibidos por piso de seguridad', async () => {
    await expect(core.policies.upsert({ scope: 'GLOBAL', operationType: 'DELETE_EXTERNAL', mode: 'AUTO_APPROVED', mandatory: false, description: '', rules: {} }, actor(core))).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
    expect((await core.policies.resolve('DELETE_EXTERNAL')).mode).toBe('DENIED');
  });
});
