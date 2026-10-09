// Prueba de humo del motor en proceso (sin API ni worker): crea una ejecución demo y la procesa.
// Uso: node --import tsx packages/core/scripts/smoke.ts [EPIC|STORY]
import { disconnectPrisma } from '@mao/db';
import { Core, ownerActor } from '../src/index';

const flow = (process.argv[2] ?? 'EPIC').toUpperCase();
const core = new Core();
const actor = ownerActor(core.deps, 'CLI');
try {
  const ex = await core.engine.createExecution(
    flow === 'EPIC'
      ? { projectKey: 'DEMO', orchestratorKey: 'EPIC_TO_STORIES_AND_TASKS', input: { epicKey: 'DEMO-100' }, source: 'CLI' }
      : { projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: 'CLI' },
    actor,
  );
  console.log(`Creada EX-${ex.number}`);
  await core.engine.runUntilIdle();
  let detail = await core.engine.get(ex.id);
  console.log(`Estado: ${detail.status}`);
  for (const s of detail.steps) console.log(`  ${s.status.padEnd(16)} ${s.key}${s.error ? ` ${JSON.stringify(s.error)}` : ''}`);
  const req = detail.approvalRequests[0];
  if (req) {
    const full = await core.approvals.get(req.id);
    console.log(`Aprobación AP-${full.number}: ${full.items.length} ítems, hash ${full.decisionHash.slice(0, 10)}`);
    for (const i of full.items) console.log(`  [${i.status}] ${i.group} · ${i.title} (${i.policyMode})`);
    // Aprueba de a uno los ALWAYS_APPROVE y en lote el resto.
    const pending = full.items.filter((i) => i.status === 'PENDING');
    const individual = pending.filter((i) => i.policyMode === 'ALWAYS_APPROVE');
    const batch = pending.filter((i) => i.policyMode !== 'ALWAYS_APPROVE');
    for (const i of individual) {
      const cur = await core.approvals.get(req.id);
      await core.approvals.decide(req.id, { approve: [i.id], reject: [], comment: 'ok', channel: 'UI', confirmHash: cur.decisionHash.slice(0, 12) }, actor);
    }
    if (batch.length) {
      const cur = await core.approvals.get(req.id);
      await core.approvals.decide(req.id, { approve: batch.map((i) => i.id), reject: [], comment: 'lote', channel: 'UI', confirmHash: cur.decisionHash.slice(0, 12) }, actor);
    }
    await core.engine.runUntilIdle();
    detail = await core.engine.get(ex.id);
    console.log(`Estado final: ${detail.status}`);
    console.log(JSON.stringify({ ...(detail.output as object), publication: { ...((detail.output as any)?.publication ?? {}), results: undefined } }, null, 1));
  }
  const events = await core.engine.events(ex.id, 0n);
  console.log(`Eventos: ${events.length}`);
  for (const e of events.slice(0, 60)) console.log(`  ${e.level.padEnd(7)} ${e.type}: ${e.message}`);
} catch (err) {
  console.error('ERROR', err);
  process.exitCode = 1;
} finally {
  await core.close();
  await disconnectPrisma();
}
