// Verificación de punta a punta contra Jira REAL en modo seguro (sin escritura):
// redescubre el esquema, mapea los tipos reales, corre STORY_REVIEW_AND_DECOMPOSITION sobre una issue real,
// aprueba lo propuesto y comprueba que la publicación queda BLOQUEADA (escritura no habilitada).
// Uso: node scripts/verify-live-flow.mjs [PROYECTO] [ISSUE] [tipoHistoria] [tipoTarea] [tipoSubtarea]
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const [project = 'SCRUM', issue = 'SCRUM-1', storyType = 'Feature', taskType = 'Tarea', subtaskType = 'Subtask'] = process.argv.slice(2);
const base = process.env.MAO_API_URL || 'http://127.0.0.1:4317';
const headers = { Authorization: `Bearer ${process.env.MAO_OWNER_TOKEN}`, 'Content-Type': 'application/json', 'X-MAO-Channel': 'CLI' };
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${j.error?.code}: ${j.error?.message} ${JSON.stringify(j.error?.details ?? '')}`);
  return j;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const disc = await api('POST', `/api/projects/${project}/discover`, { apply: true });
console.log(`1) Descubrimiento real: ${disc.issueTypes.length} tipos, ${disc.fields.length} campos, ${disc.linkTypes.length} tipos de vínculo`);

const p = await api('GET', `/api/projects/${project}`);
const cfg = { ...p.config, jira: { ...(p.config.jira ?? {}), issueTypes: { epic: 'Epic', story: storyType, task: taskType, subtask: subtaskType } } };
await api('PUT', `/api/projects/${project}/config`, { config: cfg, changeNote: `Mapeo de tipos reales: historia=${storyType}, tarea=${taskType}, subtarea=${subtaskType}` });
console.log(`2) Tipos mapeados con nombres descubiertos (historia=${storyType})`);

const ex = await api('POST', '/api/executions', { projectKey: project, orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: issue }, source: 'CLI' });
console.log(`3) Ejecución EX-${ex.number} creada (modelo ${ex.simulation.model}, Jira ${ex.simulation.jira})`);
let state;
for (let i = 0; i < 90; i++) {
  state = await api('GET', `/api/executions/${ex.id}`);
  if (['WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) break;
  await sleep(2000);
}
console.log(`4) Estado: ${state.status}${state.error ? ` — ${state.error.code}: ${state.error.message}` : ''}`);
const ctx = state.steps.find((s) => s.key === 'context');
if (ctx?.output) console.log(`   Leído de Jira real: ${ctx.output.root.key} "${ctx.output.root.summary}" (${ctx.output.root.issueType}, ${ctx.output.root.status}), hijos: ${ctx.output.children.length}`);
if (state.status !== 'WAITING_APPROVAL') process.exit(state.status === 'COMPLETED' ? 0 : 1);

const ap = await api('GET', `/api/approvals/${state.approvalRequests[0].id}`);
console.log(`5) Aprobación AP-${ap.number}: ${ap.items.length} operación(es) propuestas`);
for (const it of ap.items.filter((x) => x.policyMode === 'ALWAYS_APPROVE')) {
  const cur = await api('GET', `/api/approvals/${ap.id}`);
  await api('POST', `/api/approvals/${ap.id}/decisions`, { approve: [it.id], reject: [], comment: 'Verificación: escritura deshabilitada', confirmHash: cur.decisionHash.slice(0, 12) });
}
const cur = await api('GET', `/api/approvals/${ap.id}`);
const rest = cur.items.filter((x) => x.status === 'PENDING').map((x) => x.id);
if (rest.length) await api('POST', `/api/approvals/${ap.id}/decisions`, { approve: rest, reject: [], comment: 'Verificación: escritura deshabilitada', confirmHash: cur.decisionHash.slice(0, 12) });
for (let i = 0; i < 60; i++) {
  state = await api('GET', `/api/executions/${ex.id}`);
  if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(state.status)) break;
  await sleep(2000);
}
const pub = state.output?.publication;
console.log(`6) Estado final: ${state.status} — publicación: ${pub?.succeeded} ejecutadas, ${pub?.blocked} BLOQUEADAS, ${pub?.skipped} omitidas`);
for (const r of pub?.results ?? []) console.log(`   ${r.status.padEnd(9)} ${r.title} ${r.message ? `— ${r.message}` : ''}`);
if (pub?.succeeded) {
  console.error('ATENCIÓN: hubo escrituras reales');
  process.exit(1);
}
