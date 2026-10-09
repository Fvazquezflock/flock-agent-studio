import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { orchestratorDefinitionSchema } from '@mao/shared';
import { Core, DemoJiraGateway, McpStdioClient, MockModelProvider } from '../../src/index';
import type { IModelProvider } from '../../src/providers/types';
import { FakeLiveJira } from './fake-jira';
import { actor, approveAll, installActive, runToRest, testCore } from './helpers';

const cores: Core[] = [];
afterAll(async () => {
  for (const c of cores) await c.close();
  await disconnectPrisma();
});

async function liveProject(c: Core) {
  const prisma = c.deps.prisma;
  await prisma.connection.update({ where: { key: 'jira-mcp' }, data: { writeEnabled: true } });
  const exists = await prisma.project.findUnique({ where: { key: 'LIVE2' } });
  if (exists) return;
  const demo = await prisma.project.findUniqueOrThrow({ where: { key: 'DEMO' }, include: { configurations: { where: { status: 'ACTIVE' } } } });
  const conn = await prisma.connection.findUniqueOrThrow({ where: { key: 'jira-mcp' } });
  await prisma.project.create({
    data: {
      key: 'LIVE2',
      name: 'Live 2',
      jiraProjectKey: 'DEMO',
      mode: 'JIRA',
      connectionId: conn.id,
      defaultProviderId: demo.defaultProviderId,
      configurations: { create: { version: 1, status: 'ACTIVE', config: demo.configurations[0].config as object, checksum: 'x', createdBy: 'test' } },
    },
  });
}

/** Orquestador mínimo con backoff corto para probar reintentos sin esperas largas. */
const QUICK = orchestratorDefinitionSchema.parse({
  name: 'Rápido',
  objective: 'Pruebas de resiliencia',
  inputSchema: { fields: [{ key: 'storyKey', label: 'HU', type: 'issueKey', required: true }] },
  steps: [
    { key: 'context', name: 'Contexto', handler: 'jira.context', params: { mode: 'story' }, retry: { maxAttempts: 2, backoffMs: 100 } },
    { key: 'review_story', name: 'Validación', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_review', dependsOn: ['context'], retry: { maxAttempts: 3, backoffMs: 100 } },
  ],
});

describe('reintentos y errores clasificados', () => {
  it('reintenta errores transitorios del modelo con backoff y termina bien', async () => {
    const flaky = new MockModelProvider({ failTimes: { story_review: 2 } });
    const core = await testCore({ providerFactory: () => flaky });
    cores.push(core);
    await installActive(core, 'orchestrator', 'TEST_QUICK', QUICK as unknown as Record<string, unknown>);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'TEST_QUICK', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('COMPLETED');
    const step = (await core.engine.get(ex.id)).steps.find((s) => s.key === 'review_story')!;
    expect(step.attempt).toBe(3);
    const events = await core.engine.events(ex.id, 0n);
    expect(events.filter((e) => e.type === 'STEP_RETRY_SCHEDULED')).toHaveLength(2);
  });

  it('registra el consumo de tokens de cada invocación, también la respuesta fuera de contrato', async () => {
    const mock = new MockModelProvider();
    let bad = 1;
    const usage = { inputTokens: 10, outputTokens: 200, cacheCreationInputTokens: 5000, cacheReadInputTokens: 3000, costUsd: 0.05 };
    // Proveedor "real" de prueba: la primera respuesta de story_review no cumple el contrato pero consume tokens.
    const metered: IModelProvider = {
      kind: 'LOCAL_CLAUDE',
      diagnose: () => mock.diagnose(),
      invoke: async (inv) => {
        const r = await mock.invoke(inv);
        if (inv.task === 'story_review' && bad-- > 0) return { ...r, output: { sinDiagnostico: true }, simulated: false, provider: 'LOCAL_CLAUDE', model: 'modelo-prueba', usage };
        return { ...r, simulated: false, provider: 'LOCAL_CLAUDE', model: 'modelo-prueba', usage };
      },
    };
    const core = await testCore({ providerFactory: () => metered });
    cores.push(core);
    await installActive(core, 'orchestrator', 'TEST_QUICK', QUICK as unknown as Record<string, unknown>);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'TEST_QUICK', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    expect((await runToRest(core, ex.id)).status).toBe('COMPLETED');

    const rows = await core.deps.prisma.modelInvocation.findMany({ where: { executionId: ex.id }, orderBy: { id: 'asc' } });
    const review = rows.filter((r) => r.stepKey === 'review_story');
    expect(review.map((r) => [r.attempt, r.outcome])).toEqual([
      [1, 'INVALID_RESPONSE'],
      [2, 'OK'],
    ]);
    expect(rows.every((r) => r.origin === 'EXECUTION' && r.provider === 'LOCAL_CLAUDE' && r.cacheCreationInputTokens === 5000)).toBe(true);

    const u = await core.usage.forExecution(String(ex.number));
    const n = rows.length;
    expect(u.totals).toMatchObject({ invocations: n, failed: 1, inputTokens: 10 * n, outputTokens: 200 * n, cacheCreationInputTokens: 5000 * n, cacheReadInputTokens: 3000 * n, totalTokens: 8210 * n });
    expect(u.totals.costUsd).toBeCloseTo(0.05 * n);
    expect(u.byAgent.find((a) => a.agentKey === 'FunctionalAnalyst')).toMatchObject({ invocations: 2, failed: 1 });
    expect(u.byStep.find((s) => s.stepKey === 'review_story')?.invocations).toBe(2);

    const summary = await core.usage.summary({ days: 1, projectKey: 'DEMO' });
    expect(summary.topExecutions.some((t) => t.executionId === ex.id && t.invocations === n)).toBe(true);
  });

  it('MCP desconectado: reintenta y falla con el código correcto al agotar intentos', async () => {
    const broken = new FakeLiveJira();
    broken.failGetIssue = 'MCP_DISCONNECTED';
    const core = await testCore({ gatewayFactory: () => broken });
    cores.push(core);
    await installActive(core, 'orchestrator', 'TEST_QUICK', QUICK as unknown as Record<string, unknown>);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'TEST_QUICK', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('FAILED');
    expect((state.error as any).code).toBe('MCP_DISCONNECTED');
    const ctx = (await core.engine.get(ex.id)).steps.find((s) => s.key === 'context')!;
    expect(ctx.attempt).toBe(2);
  });

  it('un servidor MCP inexistente se informa como herramienta no disponible', async () => {
    const client = new McpStdioClient({ transport: 'stdio', command: 'C:/no/existe/mcp.exe', args: [] });
    await expect(client.connect()).rejects.toMatchObject({ code: 'TOOL_UNAVAILABLE' });
  });

  it('errores de autorización no se reintentan', async () => {
    const core = await testCore();
    cores.push(core);
    await expect(core.engine.createExecution({ projectKey: 'NOEXISTE', orchestratorKey: 'TEST_QUICK', input: {}, source: 'API' }, actor(core))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('idempotencia, reconciliación y conflictos (Jira simulado en modo LIVE)', () => {
  it('un timeout después de crear no duplica la issue: se reconcilia por etiqueta de correlación', async () => {
    const fake = new FakeLiveJira();
    fake.timeoutAfterCreate = 1;
    const core = await testCore({ gatewayFactory: ({ project }) => (project.mode === 'JIRA' ? fake : new DemoJiraGateway()), allowJiraWrites: true });
    cores.push(core);
    await liveProject(core);
    const ex = await core.engine.createExecution({ projectKey: 'LIVE2', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const creates = req.items.filter((i) => i.operationType === 'CREATE_ISSUE').length;
    await approveAll(core, req.id);
    const state = await runToRest(core, ex.id, 45_000);
    expect(state.status).toBe('COMPLETED');
    const ops = await core.deps.prisma.externalOperation.findMany({ where: { executionId: ex.id, kind: 'CREATE_ISSUE' } });
    expect(ops).toHaveLength(creates);
    expect(ops.every((o) => o.status === 'SUCCEEDED')).toBe(true);
    expect(ops.some((o) => (o.result as any).reconciled)).toBe(true);
    // Se llamó a Jira exactamente una vez por issue: la operación incierta no se repitió.
    expect(fake.creates).toBe(creates);
    const created = [...fake.issues.values()].filter((i) => i.labels.some((l) => l.startsWith('mao-')));
    expect(created).toHaveLength(creates);
  });

  it('si la HU cambió en Jira durante la ejecución, se detiene la escritura y se pide nueva revisión', async () => {
    const fake = new FakeLiveJira();
    const core = await testCore({ gatewayFactory: ({ project }) => (project.mode === 'JIRA' ? fake : new DemoJiraGateway()), allowJiraWrites: true });
    cores.push(core);
    await liveProject(core);
    const ex = await core.engine.createExecution({ projectKey: 'LIVE2', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    await approveAll(core, (await core.engine.get(ex.id)).approvalRequests[0].id);
    fake.touch('DEMO-102'); // alguien edita la HU antes de la publicación
    let state = await runToRest(core, ex.id);
    expect(state.status).toBe('WAITING_APPROVAL');
    expect(fake.updates).toBe(0);
    const detail = await core.engine.get(ex.id);
    const conflict = detail.approvalRequests.find((r) => r.kind === 'conflict_review')!;
    expect(conflict).toBeTruthy();
    const creq = await core.approvals.get(conflict.id);
    expect((creq.items[0].original as any).description).toMatch(/editado por otra persona/);
    await approveAll(core, conflict.id);
    state = await runToRest(core, ex.id);
    expect(state.status).toBe('COMPLETED');
    expect(fake.updates).toBe(1);
  });
});

describe('recuperación tras reinicio y cancelación', () => {
  it('una ejecución tomada por un worker caído se retoma al vencer el lease', async () => {
    const core = await testCore();
    cores.push(core);
    const prisma = core.deps.prisma;
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    // Simula un worker que tomó la ejecución, empezó la primera etapa y murió.
    const claimed = await core.engine.claim('worker-caido', 10);
    expect(claimed).toContain(ex.id);
    await prisma.executionStep.update({ where: { executionId_key: { executionId: ex.id, key: 'context' } }, data: { status: 'RUNNING', attempt: 1, startedAt: new Date() } });
    await prisma.execution.update({ where: { id: ex.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });

    const state = await runToRest(core, ex.id);
    expect(state.status).toBe('WAITING_APPROVAL');
    const events = await core.engine.events(ex.id, 0n);
    expect(events.some((e) => e.type === 'STEP_RECOVERED')).toBe(true);
  });

  it('el estado sobrevive a un "reinicio" (otro Core sobre la misma base)', async () => {
    const a = await testCore();
    cores.push(a);
    const ex = await a.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(a));
    await runToRest(a, ex.id);
    const b = new Core({ ownerName: 'otro proceso' });
    cores.push(b);
    const seen = await b.engine.get(ex.id);
    expect(seen.status).toBe('WAITING_APPROVAL');
    expect(seen.steps.filter((s) => s.status === 'COMPLETED').length).toBeGreaterThan(5);
  });

  it('cancelar una ejecución en espera cierra sus aprobaciones', async () => {
    const core = await testCore();
    cores.push(core);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const after = await core.engine.cancel(ex.id, actor(core));
    expect(after.status).toBe('CANCELLED');
    expect(after.approvalRequests.every((r) => r.status === 'CANCELLED')).toBe(true);
    await expect(core.engine.cancel(ex.id, actor(core))).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });
});
