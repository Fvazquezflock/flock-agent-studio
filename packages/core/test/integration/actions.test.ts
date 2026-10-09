import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { Core, DemoJiraGateway, MockModelProvider } from '../../src/index';
import type { IModelProvider } from '../../src/providers/types';
import { FakeLiveJira } from './fake-jira';
import { actor, approveAll, runToRest, testCore } from './helpers';

const cores: Core[] = [];
afterAll(async () => {
  for (const c of cores) await c.close();
  await disconnectPrisma();
});

/** Proyecto en modo JIRA contra el Jira simulado (misma base de datos demo), con escritura habilitada. */
async function liveProject(c: Core, key: string, cancelTransition?: { id: string; name: string }) {
  const prisma = c.deps.prisma;
  await prisma.connection.update({ where: { key: 'jira-mcp' }, data: { writeEnabled: true } });
  if (!(await prisma.project.findUnique({ where: { key } }))) {
    const demo = await prisma.project.findUniqueOrThrow({ where: { key: 'DEMO' }, include: { configurations: { where: { status: 'ACTIVE' } } } });
    const conn = await prisma.connection.findUniqueOrThrow({ where: { key: 'jira-mcp' } });
    await prisma.project.create({
      data: {
        key,
        name: key,
        jiraProjectKey: 'DEMO',
        mode: 'JIRA',
        connectionId: conn.id,
        defaultProviderId: demo.defaultProviderId,
        configurations: { create: { version: 1, status: 'ACTIVE', config: demo.configurations[0].config as object, checksum: 'x', createdBy: 'test' } },
      },
    });
  }
  if (cancelTransition) {
    const p = await prisma.project.findUniqueOrThrow({ where: { key } });
    const cfg = (await c.config.activeProjectConfig(p.id)).config as { jira?: Record<string, unknown> };
    await c.config.saveProjectConfig(key, { ...cfg, jira: { ...(cfg.jira ?? {}), cancelTransition } }, 'Transición de cancelación (prueba)', actor(c));
  }
}

/** Proveedor simulado que además recomienda cancelar la HU por duplicada. */
function cancellingProvider(): IModelProvider {
  const mock = new MockModelProvider();
  return {
    kind: 'MOCK',
    diagnose: () => mock.diagnose(),
    invoke: async (inv) => {
      const r = await mock.invoke(inv);
      if (inv.task !== 'story_review') return r;
      return {
        ...r,
        output: {
          ...(r.output as object),
          cancellation: { reason: 'DUPLICATE', explanation: 'Pide lo mismo que DEMO-101: consultar la disponibilidad por sucursal.', duplicateOf: 'DEMO-101', evidence: ['DEMO-101 › Resumen', 'DEMO-102 › Descripción'] },
        },
      };
    },
  };
}

describe('acción y motivo de cada operación propuesta', () => {
  it('flujo B: modificar la HU cita las inconsistencias encontradas y cada tarea dice por qué se crea', async () => {
    const core = await testCore();
    cores.push(core);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const upd = req.items.find((i) => i.itemKey === 'story:update')!;
    expect(upd.action).toBe('UPDATE');
    const why = upd.rationale as any;
    expect(why.reason).toMatch(/inconsistencia/);
    expect(why.inconsistencies.length).toBeGreaterThan(0);
    expect(why.inconsistencies[0]).toHaveProperty('description');
    expect(why.evidence.length).toBeGreaterThan(0);
    const tasks = req.items.filter((i) => i.operationType === 'CREATE_ISSUE');
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((t) => t.action === 'CREATE' && String((t.rationale as any).reason).length > 10)).toBe(true);
    expect(req.items.filter((i) => i.operationType === 'CREATE_ISSUE_LINK').every((l) => l.action === 'CREATE' && (l.rationale as any)?.reason)).toBe(true);
  });

  it('flujo A: cada historia nueva dice qué parte de la épica cubre', async () => {
    const core = await testCore();
    cores.push(core);
    const ex = await core.engine.createExecution({ projectKey: 'DEMO', orchestratorKey: 'EPIC_TO_STORIES_AND_TASKS', input: { epicKey: 'DEMO-100' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const stories = req.items.filter((i) => i.itemKey.startsWith('story:'));
    expect(stories.length).toBeGreaterThan(0);
    for (const s of stories) {
      expect(s.action).toBe('CREATE');
      expect((s.rationale as any).reason).toMatch(/DEMO-100/);
      expect((s.rationale as any).evidence.length).toBeGreaterThan(0);
    }
  });

  it('cancelar una HU duplicada: transición con aprobación individual y el motivo como comentario en Jira', async () => {
    const fake = new FakeLiveJira();
    const core = await testCore({ providerFactory: cancellingProvider, gatewayFactory: ({ project }) => (project.mode === 'JIRA' ? fake : new DemoJiraGateway()), allowJiraWrites: true });
    cores.push(core);
    await liveProject(core, 'LIVECANCEL', { id: '91', name: 'Cancelada' });
    const ex = await core.engine.createExecution({ projectKey: 'LIVECANCEL', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    const cancel = req.items.find((i) => i.itemKey === 'cancel:DEMO-102')!;
    expect(cancel).toMatchObject({ operationType: 'TRANSITION_ISSUE', action: 'CANCEL', policyMode: 'ALWAYS_APPROVE' });
    expect((cancel.rationale as any).reason).toMatch(/Duplicada de DEMO-101/);
    expect(cancel.payload).toMatchObject({ issueKey: 'DEMO-102', transitionId: '91', transitionName: 'Cancelada', reason: 'DUPLICATE' });

    await approveAll(core, req.id);
    expect((await runToRest(core, ex.id, 45_000)).status).toBe('COMPLETED');
    expect(fake.transitions).toHaveLength(1);
    expect(fake.transitions[0]).toMatchObject({ issueKey: 'DEMO-102', transitionId: '91' });
    expect(fake.transitions[0].comment).toMatch(/Duplicada/);
    expect(fake.issues.get('DEMO-102')?.status).toBe('Cancelada');
  });

  it('sin transición de cancelación mapeada, la publicación real no cancela y explica qué falta', async () => {
    const fake = new FakeLiveJira();
    const core = await testCore({ providerFactory: cancellingProvider, gatewayFactory: ({ project }) => (project.mode === 'JIRA' ? fake : new DemoJiraGateway()), allowJiraWrites: true });
    cores.push(core);
    await liveProject(core, 'LIVENOMAP');
    const ex = await core.engine.createExecution({ projectKey: 'LIVENOMAP', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'API' }, actor(core));
    await runToRest(core, ex.id);
    const req = await core.approvals.get((await core.engine.get(ex.id)).approvalRequests[0].id);
    expect(req.items.find((i) => i.itemKey === 'cancel:DEMO-102')?.payload).toMatchObject({ transitionId: null });
    await approveAll(core, req.id);
    await runToRest(core, ex.id, 45_000);
    const out = (await core.engine.get(ex.id)).steps.find((s) => s.key === 'publish')!.output as any;
    const result = out.results.find((r: any) => r.itemKey === 'cancel:DEMO-102');
    expect(result.status).toBe('SKIPPED');
    expect(result.message).toMatch(/Falta mapear la transición/);
    expect(fake.transitions).toHaveLength(0);
  });
});
