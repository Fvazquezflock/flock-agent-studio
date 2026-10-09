import { afterAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { actor, approveAll, testCore } from './helpers';

const core = await testCore();
afterAll(async () => {
  await core.close();
  await disconnectPrisma();
});

describe('catálogo versionado: agentes y skills', () => {
  it('CRUD y versionado de agentes con activación aprobada', async () => {
    const a = actor(core);
    const def = { name: 'Analista Oracle', systemPrompt: 'Analizás PL/SQL.', tasks: ['technical_breakdown'], skills: ['TechnicalDecomposition'] };
    const created = await core.catalog.create('agent', 'OracleAnalyst', def, 'Inicial', a);
    expect(created.version.status).toBe('DRAFT');

    // Los borradores se editan; el checksum cambia con el contenido.
    const edited = await core.catalog.updateDraft('agent', 'OracleAnalyst', 1, { ...def, objective: 'Validar SQL' }, 'Objetivo', a);
    expect(edited.version.checksum).not.toBe(created.version.checksum);

    // Activar exige aprobación (política ACTIVATE_AGENT).
    const req = await core.catalog.requestActivation('agent', 'OracleAnalyst', 1, a);
    expect(req.items[0].operationType).toBe('ACTIVATE_AGENT');
    let entity = await core.catalog.get('agent', 'OracleAnalyst');
    expect(entity.status).toBe('DRAFT');
    expect(entity.versions[0].status).toBe('PENDING_APPROVAL');
    await expect(core.catalog.updateDraft('agent', 'OracleAnalyst', 1, def, '', a)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });

    await approveAll(core, req.id);
    entity = await core.catalog.get('agent', 'OracleAnalyst');
    expect(entity.status).toBe('ACTIVE');
    expect(entity.activeVersion?.version).toBe(1);

    // Nueva versión: v1 sigue activa hasta aprobar v2.
    await core.catalog.createVersion('agent', 'OracleAnalyst', { ...def, objective: 'v2' }, 'Segunda', a);
    const req2 = await core.catalog.requestActivation('agent', 'OracleAnalyst', 2, a);
    expect((await core.catalog.get('agent', 'OracleAnalyst')).activeVersion?.version).toBe(1);
    await approveAll(core, req2.id);
    entity = await core.catalog.get('agent', 'OracleAnalyst');
    expect(entity.activeVersion?.version).toBe(2);
    expect(entity.versions.find((v) => v.version === 1)?.status).toBe('INACTIVE');

    const diff = await core.catalog.diff('agent', 'OracleAnalyst', 1, 2);
    expect(diff.lines.some((l) => l.type === 'add' && l.text.includes('v2'))).toBe(true);

    // Restaurar crea un borrador nuevo; duplicar crea otra entidad.
    const restored = await core.catalog.restore('agent', 'OracleAnalyst', 1, a);
    expect(restored.version.version).toBe(3);
    expect(restored.version.status).toBe('DRAFT');
    const dup = await core.catalog.duplicate('agent', 'OracleAnalyst', 'OracleAnalyst2', a);
    expect(dup.version.status).toBe('DRAFT');
  });

  it('rechazar la activación deja la versión rechazada', async () => {
    const a = actor(core);
    await core.catalog.create('skill', 'SkillRechazada', { name: 'S', instructions: '# S' }, 'Inicial', a);
    const req = await core.catalog.requestActivation('skill', 'SkillRechazada', 1, a);
    const full = await core.approvals.get(req.id);
    await core.approvals.decide(req.id, { approve: [], reject: [full.items[0].id], comment: 'no', channel: 'UI', confirmHash: full.decisionHash.slice(0, 12) }, a);
    const s = await core.catalog.get('skill', 'SkillRechazada');
    expect(s.status).toBe('DRAFT');
    expect(s.versions[0].status).toBe('REJECTED');
  });

  it('valida referencias y rechaza orquestadores con ciclos', async () => {
    const a = actor(core);
    await expect(core.catalog.create('agent', 'AgenteMalo', { name: 'X', systemPrompt: 'p', skills: ['NoExiste'] }, '', a)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      core.catalog.create(
        'orchestrator',
        'CICLO',
        {
          name: 'Ciclo',
          objective: 'x',
          steps: [
            { key: 'aa', name: 'A', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_review', dependsOn: ['bb'] },
            { key: 'bb', name: 'B', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_improvements', dependsOn: ['aa'] },
          ],
        },
        '',
        a,
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('el supervisor principal no puede desactivarse', async () => {
    await expect(core.catalog.deactivate('agent', 'MainSupervisor', actor(core))).rejects.toMatchObject({ code: 'AUTHORIZATION_ERROR' });
  });
});
