// Verificación de lectura REAL de Jira vía la API de la plataforma (solo lectura).
// Uso: node scripts/verify-jira-read.mjs <PROYECTO_PLATAFORMA> <ISSUE>
// Requiere la API iniciada y un proyecto en modo JIRA con la conexión jira-mcp.
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const [projectKey = 'SCRUM', issueKey = 'SCRUM-1'] = process.argv.slice(2);
const base = process.env.MAO_API_URL || 'http://127.0.0.1:4317';
const headers = { Authorization: `Bearer ${process.env.MAO_OWNER_TOKEN}`, 'Content-Type': 'application/json', 'X-MAO-Channel': 'CLI' };
const api = async (method, url, body) => {
  const r = await fetch(base + url, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body ?? {}) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${j.error?.code}: ${j.error?.message}`);
  return j;
};

const d = await api('POST', `/api/projects/${projectKey}/discover`, { apply: true });
console.log(`Descubrimiento (${d.mode}): tipos = ${d.issueTypes.map((t) => t.name + (t.subtask ? ' (subtarea)' : '')).join(', ')} | campos = ${d.fields.length} | vínculos = ${d.linkTypes.map((l) => l.name).join(', ')}`);
const t = await api('POST', '/api/connections/jira-mcp/test-read', { projectKey: d.mode === 'LIVE' ? (await api('GET', `/api/projects/${projectKey}`)).jiraProjectKey : projectKey, issueKey });
if (!t.ok) throw new Error(`Lectura falló: ${t.error.code} ${t.error.message}`);
console.log(`Lectura real OK: ${t.issue.key} "${t.issue.summary}" (${t.issue.issueType}, ${t.issue.status}), actualizado ${t.issue.updated}`);
