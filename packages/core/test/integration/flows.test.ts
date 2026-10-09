import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { actor, approveAll, runToRest, testCore } from './helpers';

const core = await testCore();
afterAll(async () => {
  await core.close();
  await disconnectPrisma();
});

describe('Orquestador A: épica → historias → tareas (demo)', () => {
  it('genera, valida, pide aprobación y publica de forma simulada', async () => {
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'EPIC_TO_STORIES_AND_TASKS', input: { epicKey: 'DEMO-100' }, source: 'CLI' }, actor(core, 'CLI'));
    expect(ex.status).toBe('PENDING');
    let state = await runToRest(core, ex.id);
    expect(state.status).toBe('WAITING_APPROVAL');

    const detail = await core.engine.get(ex.id);
    const done = detail.steps.filter((s) => s.status === 'COMPLETED').map((s) => s.key);
    expect(done).toEqual(expect.arrayContaining(['context', 'analysis', 'stories', 'tasks_backend', 'tasks_frontend', 'tasks_fullstack', 'validation', 'dependencies', 'review']));
    // La ejecución fija versiones exactas.
    expect((detail.snapshot as any).agents.length).toBeGreaterThanOrEqual(9);
    // Los tres especialistas corrieron en paralelo (misma capa).
    const events = await core.engine.events(ex.id, 0n);
    expect(events.some((e) => e.type === 'PARALLEL_STEPS')).toBe(true);
    expect(events.some((e) => e.type === 'UNTRUSTED_CONTENT')).toBe(true);

    const req = detail.approvalRequests[0];
    const full = await core.approvals.get(req.id);
    expect(full.items.filter((i) => i.group === 'Historias').length).toBeGreaterThanOrEqual(3);
    expect(full.items.every((i) => i.status === 'PENDING')).toBe(true);

    await approveAll(core, req.id);
    state = await runToRest(core, ex.id);
    expect(state.status).toBe('COMPLETED');
    const out = state.output as any;
    expect(out.publication.mode).toBe('DEMO');
    expect(out.publication.simulated).toBe(full.items.length);
    expect(out.publication.succeeded).toBe(0);
    const ops = await core.deps.prisma.externalOperation.findMany({ where: { executionId: ex.id } });
    expect(ops.every((o) => o.status === 'SIMULATED' && o.mode === 'SIMULATED')).toBe(true);
    // Capacidad faltante detectada (Oracle SQL) como propuesta en borrador.
    const detected = out.proposals.find((p: any) => p.targetKey === 'OracleSQLValidation');
    expect(detected).toBeTruthy();
    // La propuesta que devolvió esta ejecución (otras pruebas pueden haber dejado propuestas anteriores ya aplicadas).
    const prop = await core.deps.prisma.capabilityProposal.findUnique({ where: { id: detected.id } });
    expect(prop?.status).toBe('DRAFT');
  });

  it('rechazar y regenerar vuelve a correr la generación con la observación', async () => {
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'EPIC_TO_STORIES_AND_TASKS', input: { epicKey: 'DEMO-100' }, source: 'UI' }, actor(core));
    await runToRest(core, ex.id);
    const first = (await core.engine.get(ex.id)).approvalRequests[0];
    await core.approvals.regenerate(first.id, 'Agregá criterios de auditoría', 'UI', actor(core));
    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('WAITING_APPROVAL');
    const detail = await core.engine.get(ex.id);
    expect(detail.approvalRequests.find((r) => r.id === first.id)?.status).toBe('SUPERSEDED');
    const stories = detail.steps.find((s) => s.key === 'stories')!;
    expect((stories.output as any).notes.join(' ')).toMatch(/auditoría/);
    expect(detail.approvalRequests.filter((r) => r.status === 'PENDING')).toHaveLength(1);
  });
});

describe('Orquestador B: HU existente → validación → tareas (demo)', () => {
  it('diagnostica, propone mejoras, evita duplicados y publica lo aprobado', async () => {
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'UI' }, actor(core));
    let state = await runToRest(core, ex.id);
    expect(state.status).toBe('WAITING_APPROVAL');
    const detail = await core.engine.get(ex.id);
    const review = detail.steps.find((s) => s.key === 'review_story')!.output as any;
    expect(review.diagnosis.readiness).toBe('NOT_READY');
    const be = detail.steps.find((s) => s.key === 'tasks_backend')!.output as any;
    expect(be.tasks[0].duplicateOf).toBe('DEMO-112');

    const req = await core.approvals.get(detail.approvalRequests[0].id);
    const update = req.items.find((i) => i.operationType === 'UPDATE_ISSUE')!;
    expect(update.policyMode).toBe('ALWAYS_APPROVE');
    expect((update.original as any).summary).toBe('Reservar turno');
    expect(req.items.some((i) => (i.payload as any).summary?.startsWith('[BE]'))).toBe(false);

    // Lo individual no se aprueba en lote.
    await expect(
      core.approvals.decide(req.id, { approve: req.items.map((i) => i.id), reject: [], comment: '', channel: 'UI', confirmHash: req.decisionHash.slice(0, 12) }, actor(core)),
    ).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });

    await approveAll(core, req.id);
    state = await runToRest(core, ex.id);
    expect(state.status).toBe('COMPLETED');
    expect((state.output as any).publication.simulated).toBe(req.items.length);
  });

  it('valida la entrada contra el esquema del orquestador y el proyecto', async () => {
    await expect(core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: {}, source: 'API' }, actor(core))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'OTRO-1' }, source: 'API' }, actor(core))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('una épica pasada al flujo de historias falla con un error de validación claro', async () => {
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-100' }, source: 'API' }, actor(core));
    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('FAILED');
    expect((state.error as any).code).toBe('VALIDATION_ERROR');
  });
});

describe('Supervisor', () => {
  it('interpreta un pedido en lenguaje natural y crea la ejecución con el mismo motor', async () => {
    const r = await core.supervisor.run('Analizá la épica DEMO-100 y proponé historias y tareas técnicas.', { source: 'CLAUDE_CODE' }, actor(core, 'CLAUDE_CODE'));
    expect(r.plan.orchestratorKey).toBe('EPIC_TO_STORIES_AND_TASKS');
    expect(r.plan.projectKey).toBe('DEMO');
    expect(r.execution?.source).toBe('CLAUDE_CODE');
  });

  it('informa capacidad faltante si ningún flujo aplica', async () => {
    const plan = await core.supervisor.plan('Traducí el manual al alemán');
    expect(plan.orchestratorKey).toBeNull();
    expect(plan.missingCapability).toBeTruthy();
  });
});
