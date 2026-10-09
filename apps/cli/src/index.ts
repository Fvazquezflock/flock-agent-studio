import { parseArgs } from 'node:util';
import { approvalLabel, executionLabel, fmtDateTime, fmtDuration, fmtNumber } from '@mao/shared';
import { ApiClient, ApiError } from './client';
import { doctor } from './doctor';

const HELP = `mao — CLI de Multi-Agent Orchestration Studio (cliente de la API local)

Uso: pnpm mao <comando> [opciones]

  doctor [--mcp]                          Diagnóstico del entorno (--mcp prueba MCP y proveedores en vivo)
  projects                                Lista proyectos
  orchestrators                           Lista orquestadores y sus etapas
  agents                                  Lista agentes activos
  backlog --project P                     Épicas abiertas del proyecto en Jira (solo lectura)
      [--epic KEY]                        Historias de una épica
      [--stories [--sin-epica]]           Historias del proyecto (o solo las que no tienen épica)
      [--buscar "texto o clave"] [--todas] (--todas incluye terminadas)
  ask "<pedido>" [--project P] [--wait]   El supervisor interpreta el pedido, elige el flujo y lo ejecuta
      [--plan-only] [--provider K]
  run <ORQUESTADOR> --project P           Crea una ejecución
      [--epic KEY | --story KEY] [--input k=v ...] [--provider K] [--wait]
  executions [--status S] [--project P]   Lista ejecuciones (S: ACTIVE, COMPLETED, FAILED…)
  status <EX>                             Estado y etapas de una ejecución (EX-12, 12 o id)
  watch <EX>                              Sigue los eventos en vivo
  result <EX> [--json]                    Resultado de una ejecución
  cancel <EX> | retry <EX>                Cancela o reintenta una ejecución
  approvals [--all]                       Solicitudes de aprobación pendientes (--all: todas)
  approval <AP>                           Detalle de una solicitud y su hash de confirmación
  approve <AP> --confirm HASH             Aprueba ítems (--items a,b | --batch: todos los aprobables por lote)
      [--items a,b | --batch] [--comment "…"]
  reject <AP> --confirm HASH              Rechaza ítems (--items a,b | --all)
      [--items a,b | --all] [--comment "…"]
  proposals                               Propuestas de capacidades
  usage [EX] [--days N] [--project P]     Consumo de tokens: de una ejecución (por agente) o general (por agente y origen)
  files                                   Estado de los archivos de catalog/ (definiciones y configuración) frente a la base
  files sync                              Exporta lo aprobado e importa los archivos cambiados como versiones pendientes de aprobación
  files export [--sobrescribir]           Escribe los archivos desde la base sin pisar cambios sin importar
      [--confirmar]                       (--sobrescribir también los reemplaza y exige --confirmar)
  files apply [--archivo RUTA ...]        Muestra el diff de la configuración editada a mano y sale sin cambiar nada
      [--confirmar]                       (con --confirmar la aplica a la base)

Opciones globales: --json (salida cruda)
`;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  strict: false,
  options: {
    project: { type: 'string' },
    epic: { type: 'string' },
    story: { type: 'string' },
    input: { type: 'string', multiple: true },
    provider: { type: 'string' },
    wait: { type: 'boolean' },
    'plan-only': { type: 'boolean' },
    status: { type: 'string' },
    limit: { type: 'string' },
    json: { type: 'boolean' },
    all: { type: 'boolean' },
    batch: { type: 'boolean' },
    items: { type: 'string' },
    confirm: { type: 'string' },
    comment: { type: 'string' },
    mcp: { type: 'boolean' },
    stories: { type: 'boolean' },
    'sin-epica': { type: 'boolean' },
    buscar: { type: 'string' },
    todas: { type: 'boolean' },
    days: { type: 'string' },
    local: { type: 'boolean' },
    archivo: { type: 'string', multiple: true },
    sobrescribir: { type: 'boolean' },
    confirmar: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

const api = new ApiClient();
const out = (s = '') => process.stdout.write(`${s}\n`);
const json = (v: unknown) => out(JSON.stringify(v, null, 2));
const pad = (s: unknown, n: number) => String(s ?? '').slice(0, n).padEnd(n);

function table(rows: Record<string, unknown>[], cols: [string, string, number][]) {
  out(cols.map(([, h, w]) => pad(h, w)).join('  '));
  out(cols.map(([, , w]) => '-'.repeat(w)).join('  '));
  for (const r of rows) out(cols.map(([k, , w]) => pad(r[k], w)).join('  '));
}

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];

async function printExecution(id: string) {
  const ex = await api.get(`/api/executions/${encodeURIComponent(id)}`);
  if (opts.json) return json(ex);
  const sim = ex.simulation as { model: string; jira: string };
  out(`${executionLabel(ex.number)} · ${ex.orchestratorVersion.orchestrator.key} v${ex.orchestratorVersion.version} · proyecto ${ex.project.key}`);
  out(`Estado: ${ex.status}${ex.currentStepKey ? ` (etapa ${ex.currentStepKey})` : ''} · origen ${ex.source} · creada ${fmtDateTime(ex.createdAt)}`);
  out(`Modelo: ${sim.model === 'SIMULATED' ? 'SIMULADO (mock)' : ex.provider.key} · Jira: ${sim.jira === 'DEMO' ? 'DEMO (publicación simulada)' : 'real'}`);
  out(`Entrada: ${JSON.stringify(ex.input)}`);
  out('');
  table(
    ex.steps.map((s: any) => ({ ...s, dur: s.startedAt && s.finishedAt ? fmtDuration(new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) : '', err: s.error ? `${s.error.code}: ${s.error.message}` : '' })),
    [
      ['status', 'Estado', 16],
      ['key', 'Etapa', 16],
      ['agentKey', 'Agente', 20],
      ['attempt', 'Int.', 4],
      ['dur', 'Duración', 9],
      ['err', 'Error', 60],
    ],
  );
  const open = ex.approvalRequests.filter((a: any) => ['PENDING', 'PARTIALLY_DECIDED'].includes(a.status));
  for (const a of open) out(`\n⧗ Aprobación pendiente ${approvalLabel(a.number)}: "${a.title}" → pnpm mao approval ${a.number}`);
  if (ex.error) out(`\nError: ${ex.error.code} — ${ex.error.message}`);
  return ex;
}

async function watch(id: string) {
  const ex = await api.get(`/api/executions/${encodeURIComponent(id)}`);
  out(`Siguiendo ${executionLabel(ex.number)} (Ctrl+C para salir)…`);
  await api.stream(`/api/executions/${ex.id}/stream`, (type, data) => {
    if (type === 'status') {
      if (TERMINAL.includes(data?.status) || data?.status === 'WAITING_APPROVAL') {
        out(`→ Estado: ${data.status}`);
        return true;
      }
      return false;
    }
    const icon = data.level === 'error' ? '✗' : data.level === 'warn' ? '!' : data.level === 'success' ? '✓' : '·';
    out(`${fmtDateTime(data.createdAt).slice(11)} ${icon} ${data.stepKey ? `[${data.stepKey}] ` : ''}${data.message}`);
    return false;
  });
}

// ---------- Archivos de catalog/ ----------

const FILE_STATE: Record<string, string> = {
  IN_SYNC: 'Al día',
  MISSING_FILE: 'Falta el archivo',
  STALE_FILE: 'Archivo desactualizado',
  PENDING_APPROVAL: 'Pendiente de aprobación',
  CHANGED: 'Cambios sin importar',
  NEW: 'Nuevo',
  INVALID: 'Inválido',
  INACTIVE: 'Inactivo',
  EXPORTED: 'Exportado',
  REMOVED: 'Borrado',
  IMPORTED: 'Importado',
  APPLIED: 'Aplicado',
};
const KIND_NAME: Record<string, string> = { agent: 'Agente', skill: 'Skill', orchestrator: 'Orquestador' };
const SUBJECT_NAME: Record<string, string> = { global: 'Global', policies: 'Políticas', connections: 'Conexiones', providers: 'Proveedores', project: 'Proyecto' };

type FileBlock = any[] | { error: string };
const blockError = (b: FileBlock) => (Array.isArray(b) ? null : b.error);
const stateName = (s: string, config: boolean) => (config && s === 'CHANGED' ? 'Cambios sin aplicar' : (FILE_STATE[s] ?? s));
const reportText = (r: any) => [r.message, ...(r.errors ?? [])].filter(Boolean).join(' · ').replace(/\s+/g, ' ');

/** Tabla de archivos; `onlyChanges` oculta los que están al día (salida de sync/export/apply). */
function printFileBlock(title: string, block: FileBlock, config: boolean, onlyChanges = false) {
  const err = blockError(block);
  if (err) return out(`${title}: no disponible — ${err}`);
  const rows = block as any[];
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
  out(`${title}: ${rows.length ? [...counts].map(([s, n]) => `${stateName(s, config)}: ${n}`).join(' · ') : 'sin archivos'}`);
  const shown = onlyChanges ? rows.filter((r) => r.state !== 'IN_SYNC') : rows;
  if (!shown.length) return;
  out('');
  if (config) {
    table(
      shown.map((r) => ({ what: `${SUBJECT_NAME[r.subject] ?? r.subject}${r.key ? ` ${r.key}` : ''}`, relPath: r.relPath, state: stateName(r.state, true), msg: reportText(r) })),
      [
        ['what', 'Tipo', 16],
        ['relPath', 'Archivo', 30],
        ['state', 'Estado', 22],
        ['msg', 'Mensaje', 70],
      ],
    );
  } else {
    table(
      shown.map((r) => ({
        kind: KIND_NAME[r.kind] ?? r.kind,
        key: r.key,
        relPath: r.relPath,
        state: stateName(r.state, false),
        ver: [r.version ? `v${r.version}` : '', r.approvalNumber ? approvalLabel(r.approvalNumber) : ''].filter(Boolean).join(' · ') || '—',
        msg: reportText(r),
      })),
      [
        ['kind', 'Tipo', 11],
        ['key', 'Clave', 30],
        ['relPath', 'Archivo', 50],
        ['state', 'Estado', 23],
        ['ver', 'Versión/AP', 12],
        ['msg', 'Mensaje', 60],
      ],
    );
  }
  // Los errores completos (la tabla los recorta).
  for (const r of shown.filter((x) => x.errors?.length)) {
    out(`\nErrores en ${r.relPath}:`);
    for (const e of r.errors) out(`  - ${e}`);
  }
}

/** Diff base → archivo con dos líneas de contexto alrededor de cada cambio. */
function printDiff(lines: { type: 'same' | 'add' | 'del'; text: string }[] | undefined) {
  if (!lines) return out('    (sin diff disponible)');
  if (!lines.some((l) => l.type !== 'same')) return out('    (sin diferencias de contenido)');
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.type !== 'same') for (let j = i - 2; j <= i + 2; j++) keep.add(j);
  });
  let last = -1;
  lines.forEach((l, i) => {
    if (!keep.has(i)) return;
    if (last >= 0 && i > last + 1) out('    …');
    out(`    ${l.type === 'add' ? '+' : l.type === 'del' ? '-' : ' '} ${l.text}`);
    last = i;
  });
}

async function files(sub: string | undefined) {
  if (!sub || sub === 'status') {
    const r = await api.get('/api/catalog/files');
    if (opts.json) return json(r);
    out(`Carpeta: ${r.dir} (fuente de verdad versionada; los cambios en los archivos nunca se activan solos)\n`);
    printFileBlock('Catálogo', r.catalog, false);
    out('');
    printFileBlock('Configuración', r.config, true);
    const cat = Array.isArray(r.catalog) ? r.catalog : [];
    const cfg = Array.isArray(r.config) ? r.config : [];
    const hints: string[] = [];
    if (cat.some((x: any) => ['CHANGED', 'NEW'].includes(x.state))) hints.push('Importar los cambios de definiciones como versiones pendientes de aprobación: pnpm mao files sync');
    if (cat.some((x: any) => ['MISSING_FILE', 'STALE_FILE'].includes(x.state)) || cfg.some((x: any) => ['MISSING_FILE', 'STALE_FILE'].includes(x.state))) hints.push('Escribir los archivos que faltan o están desactualizados: pnpm mao files export');
    if (cfg.some((x: any) => x.state === 'CHANGED')) hints.push('Revisar y aplicar la configuración editada a mano: pnpm mao files apply');
    if (hints.length) out(`\n${hints.join('\n')}`);
    return;
  }
  if (sub === 'sync' || sub === 'export') {
    const overwrite = sub === 'export' && !!opts.sobrescribir;
    if (opts.sobrescribir && sub !== 'export') throw new Error('--sobrescribir solo se usa con files export');
    if (overwrite && !opts.confirmar) {
      // Vista previa: qué archivos con cambios sin importar o sin aplicar se reemplazarían por lo que tiene la base.
      const r = await api.get('/api/catalog/files');
      const lost = [
        // Las definiciones NEW (la base no las conoce) se conservan; las CHANGED e INVALID se reemplazan.
        ...(Array.isArray(r.catalog) ? r.catalog.filter((x: any) => ['CHANGED', 'INVALID'].includes(x.state)) : []),
        ...(Array.isArray(r.config) ? r.config.filter((x: any) => ['CHANGED', 'INVALID'].includes(x.state)) : []),
      ];
      out('--sobrescribir reemplaza los archivos con cambios sin importar (o sin aplicar) por lo que tiene la base. Las definiciones nuevas que la base no conoce se conservan; los archivos de proyectos que no existen en la base se borran. Esos cambios se pierden.');
      if (lost.length) {
        out(`\nSe reemplazarían o borrarían ${lost.length} archivo(s) en ${r.dir}:`);
        for (const x of lost) out(`  ${x.relPath}  (${stateName(x.state, !x.kind)})`);
      } else out('\nHoy no hay archivos con cambios sin importar: el resultado sería igual a pnpm mao files export.');
      out('\nNo se cambió nada. Para hacerlo: pnpm mao files export --sobrescribir --confirmar');
      return;
    }
    const r = await api.post('/api/catalog/files/sync', { mode: sub, ...(overwrite ? { overwrite: true } : {}) });
    if (opts.json) return json(r);
    printFileBlock('Catálogo', r.catalog, false, true);
    out('');
    printFileBlock('Configuración', r.config, true, true);
    const imported = (r.catalog as any[]).filter((x) => x.state === 'IMPORTED' && x.approvalNumber);
    if (imported.length) out(`\nLos cambios importados no se activan solos. Revisalos y aprobalos: ${imported.map((x) => `pnpm mao approval ${x.approvalNumber}`).join(' · ')}`);
    if (Array.isArray(r.config) && r.config.some((x: any) => x.state === 'CHANGED')) out('La configuración editada a mano no se aplica sola: pnpm mao files apply');
    return;
  }
  if (sub === 'apply') {
    const status = await api.get('/api/catalog/files');
    const err = blockError(status.config);
    if (err) throw new Error(`No se pudo leer el estado de la configuración: ${err}`);
    // Acepta rutas relativas a la carpeta del catálogo o a la raíz del repo, con "/" o "\".
    const prefix = `${status.dir}/`;
    const wanted = ((opts.archivo as string[] | undefined) ?? []).map((f) => {
      const p = f.replace(/\\/g, '/').replace(/^\.\//, '');
      return p.startsWith(prefix) ? p.slice(prefix.length) : p;
    });
    const config = status.config as any[];
    for (const w of wanted) {
      const found = config.find((x) => x.relPath === w);
      if (!found) throw new Error(`${w} no es un archivo de configuración del catálogo (pnpm mao files)`);
      if (found.state !== 'CHANGED') out(`Aviso: ${w} no tiene cambios sin aplicar (estado: ${stateName(found.state, true)}).`);
    }
    const targets = config.filter((x) => x.state === 'CHANGED' && (!wanted.length || wanted.includes(x.relPath)));
    if (!targets.length) return out('No hay archivos de configuración con cambios sin aplicar.');
    if (!opts.confirmar) {
      if (opts.json) return json(targets);
      out(`Se aplicaría a la base (− base, + archivo):`);
      for (const t of targets) {
        out(`\n${t.relPath}${t.message ? ` — ${t.message}` : ''}`);
        printDiff(t.diff);
      }
      const args = wanted.length ? targets.map((t) => ` --archivo ${t.relPath}`).join('') : '';
      out(`\nNo se cambió nada. Para aplicarlo: pnpm mao files apply${args} --confirmar`);
      return;
    }
    const res = await api.post('/api/catalog/files/apply', { files: targets.map((t) => t.relPath), confirm: true });
    if (opts.json) return json(res);
    printFileBlock('Configuración', res, true, true);
    return;
  }
  throw new Error(`Subcomando desconocido: files ${sub} (status, sync, export o apply)`);
}

function parseInputs(): Record<string, string> {
  const input: Record<string, string> = {};
  for (const kv of (opts.input as string[] | undefined) ?? []) {
    const i = kv.indexOf('=');
    if (i > 0) input[kv.slice(0, i)] = kv.slice(i + 1);
  }
  if (opts.epic) input.epicKey = String(opts.epic);
  if (opts.story) input.storyKey = String(opts.story);
  return input;
}

async function main() {
  const [cmd, arg] = positionals;
  if (!cmd || opts.help || cmd === 'help') return out(HELP);
  switch (cmd) {
    case 'doctor': {
      const checks = await doctor({ mcp: !!opts.mcp });
      if (opts.json) return json(checks);
      table(checks as unknown as Record<string, unknown>[], [
        ['name', 'Componente', 26],
        ['status', 'Estado', 15],
        ['detail', 'Detalle', 90],
      ]);
      if (checks.some((c) => c.status === 'Error')) process.exitCode = 1;
      return;
    }
    case 'projects': {
      const rows = await api.get('/api/projects');
      if (opts.json) return json(rows);
      return table(rows.map((p: any) => ({ ...p, conn: p.connection?.key ?? '—', prov: p.defaultProvider?.key ?? '(global)' })), [
        ['key', 'Clave', 10],
        ['name', 'Nombre', 32],
        ['jiraProjectKey', 'Jira', 8],
        ['mode', 'Modo', 6],
        ['conn', 'Conexión', 12],
        ['prov', 'Proveedor', 14],
        ['status', 'Estado', 8],
      ]);
    }
    case 'backlog': {
      if (!opts.project) throw new Error('Indicá --project');
      const project = String(opts.project).toUpperCase();
      const story = !!opts.epic || !!opts.stories;
      const q = new URLSearchParams({ kind: story ? 'story' : 'epic' });
      if (opts.epic) q.set('parent', String(opts.epic).toUpperCase());
      else if (opts['sin-epica']) q.set('withoutParent', '1');
      if (opts.buscar) q.set('q', String(opts.buscar));
      if (opts.todas) q.set('includeDone', '1');
      const r = await api.get(`/api/projects/${project}/backlog?${q}`);
      if (opts.json) return json(r);
      const what = opts.epic ? `Historias de ${String(opts.epic).toUpperCase()}` : story ? (opts['sin-epica'] ? 'Historias sin épica' : 'Historias') : 'Épicas';
      out(`${what} · ${r.projectKey} (Jira ${r.jiraProjectKey}, tipo "${r.issueType}"${r.mode === 'DEMO' ? ', datos demo' : ''})${opts.todas ? '' : ' · sin terminadas'}`);
      if (!r.items.length) return out('Sin resultados.');
      table(r.items, [
        ['key', 'Clave', 12],
        ['status', 'Estado', 14],
        ['summary', 'Resumen', 70],
      ]);
      if (r.hasMore) out(`Se muestran las primeras ${r.limit}: refiná con --buscar.`);
      // Sugerencia del siguiente paso con los orquestadores activos que leen una épica o una historia.
      const orchs = await api.get('/api/orchestrators');
      const byMode = (mode: string) => orchs.find((o: any) => o.status === 'ACTIVE' && o.activeVersion?.definition.steps.some((st: any) => st.handler === 'jira.context' && st.params?.mode === mode))?.key;
      const example = r.items[0].key;
      const orch = byMode(story ? 'story' : 'epic');
      if (orch) out(`
${story ? 'Validar una HU' : 'Analizar una épica completa'}: pnpm mao run ${orch} --project ${r.projectKey} --${story ? 'story' : 'epic'} ${example} --wait`);
      if (!story) out(`Ver sus historias: pnpm mao backlog --project ${r.projectKey} --epic ${example}`);
      return;
    }
    case 'orchestrators': {
      const rows = await api.get('/api/orchestrators');
      if (opts.json) return json(rows);
      for (const o of rows) {
        const def = o.activeVersion?.definition;
        out(`${o.key} (${o.status}${o.activeVersion ? `, v${o.activeVersion.version}` : ''}) — ${o.name}`);
        if (def) {
          out(`  Entrada: ${def.inputSchema.fields.map((f: any) => `${f.key}${f.required ? '*' : ''}`).join(', ')}`);
          out(`  Etapas: ${def.steps.map((s: any) => s.key).join(' → ')}`);
        }
      }
      return;
    }
    case 'agents': {
      const rows = await api.get('/api/agents');
      if (opts.json) return json(rows);
      return table(rows.map((a: any) => ({ ...a, v: a.activeVersion ? `v${a.activeVersion.version}` : '—', tasks: (a.activeVersion?.definition?.tasks ?? []).join(', ') })), [
        ['key', 'Agente', 22],
        ['status', 'Estado', 9],
        ['v', 'Versión', 7],
        ['tasks', 'Tareas', 70],
      ]);
    }
    case 'ask': {
      if (!arg) throw new Error('Indicá el pedido entre comillas');
      if (opts['plan-only']) {
        const plan = await api.post('/api/supervisor/plan', { text: arg, projectKey: opts.project, providerKey: opts.provider });
        return opts.json ? json(plan) : out(`Plan: ${plan.orchestratorKey ?? '(ninguno)'} · proyecto ${plan.projectKey ?? '?'} · entrada ${JSON.stringify(plan.input)}\nMotivo: ${plan.rationale}${plan.missingCapability ? `\nFaltante: ${plan.missingCapability}` : ''}`);
      }
      const r = await api.post('/api/supervisor/run', { text: arg, projectKey: opts.project, providerKey: opts.provider, source: api.channel });
      if (opts.json && !opts.wait) return json(r);
      out(`Plan del supervisor: ${r.plan.orchestratorKey ?? '(ninguno)'} · proyecto ${r.plan.projectKey ?? '?'} · confianza ${Math.round(r.plan.confidence * 100)}%`);
      out(`Motivo: ${r.plan.rationale}`);
      if (!r.execution) {
        out(`No se creó la ejecución: ${r.reason}`);
        process.exitCode = 2;
        return;
      }
      out(`Ejecución creada: ${executionLabel(r.execution.number)} (id ${r.execution.id})`);
      if (opts.wait) {
        await watch(r.execution.id);
        await printExecution(r.execution.id);
      }
      return;
    }
    case 'run': {
      if (!arg) throw new Error('Indicá el orquestador (pnpm mao orchestrators)');
      if (!opts.project) throw new Error('Indicá --project');
      const ex = await api.post('/api/executions', { projectKey: opts.project, orchestratorKey: arg, input: parseInputs(), providerKey: opts.provider, source: api.channel });
      out(`Ejecución creada: ${executionLabel(ex.number)} (id ${ex.id})`);
      if (opts.wait) {
        await watch(ex.id);
        await printExecution(ex.id);
      }
      return;
    }
    case 'executions': {
      const q = new URLSearchParams();
      if (opts.status) q.set('status', String(opts.status));
      if (opts.project) q.set('project', String(opts.project));
      q.set('limit', String(opts.limit ?? 20));
      const rows = await api.get(`/api/executions?${q}`);
      if (opts.json) return json(rows);
      return table(
        rows.map((e: any) => ({ id: executionLabel(e.number), orch: e.orchestratorVersion.orchestrator.key, project: e.project.key, status: e.status, step: e.currentStepKey ?? '', source: e.source, created: fmtDateTime(e.createdAt), sim: e.simulation?.model === 'SIMULATED' ? 'sí' : 'no' })),
        [
          ['id', 'Id', 7],
          ['orch', 'Orquestador', 32],
          ['project', 'Proyecto', 9],
          ['status', 'Estado', 16],
          ['step', 'Etapa', 14],
          ['source', 'Origen', 11],
          ['sim', 'Sim.', 4],
          ['created', 'Creada', 16],
        ],
      );
    }
    case 'status':
      if (!arg) throw new Error('Indicá la ejecución');
      await printExecution(arg);
      return;
    case 'watch':
      if (!arg) throw new Error('Indicá la ejecución');
      await watch(arg);
      return;
    case 'result': {
      if (!arg) throw new Error('Indicá la ejecución');
      const ex = await api.get(`/api/executions/${encodeURIComponent(arg)}`);
      if (opts.json) return json(ex.output ?? null);
      if (!ex.output) return out(`${executionLabel(ex.number)} todavía no tiene resultado (estado ${ex.status}).`);
      const o = ex.output;
      out(`${executionLabel(ex.number)} · ${ex.status}`);
      if (o.stories !== undefined) out(`Historias propuestas: ${o.stories}`);
      if (o.diagnosis) out(`Diagnóstico: ${o.diagnosis.readiness} (${o.diagnosis.score}/100) — ${o.diagnosis.summary}`);
      if (o.improvements !== undefined) out(`Mejoras propuestas: ${o.improvements}`);
      out(`Tareas técnicas: ${o.tasks}`);
      if (o.validation) out(`Validación QA: ${o.validation.verdict} (${o.validation.issues} observaciones)`);
      if (o.quality !== undefined) out(`Calidad (supervisor): ${o.quality}/100`);
      for (const p of o.proposals ?? []) if (p.number) out(`Propuesta de capacidad: CP-${p.number} ${p.targetKey}${p.created ? ' (nueva)' : ''}`);
      if (o.publication) {
        const pub = o.publication;
        out(`Publicación (${pub.mode === 'DEMO' ? 'SIMULADA, sin cambios en Jira' : 'Jira real'}): ${pub.succeeded} ejecutadas, ${pub.simulated} simuladas, ${pub.skipped} omitidas, ${pub.failed} fallidas, ${pub.blocked} bloqueadas`);
        for (const r of pub.results ?? []) out(`  ${pad(r.status, 10)} ${r.key ? pad(r.key, 12) : pad('', 12)} ${r.title}`);
      }
      return;
    }
    case 'cancel':
      await api.post(`/api/executions/${encodeURIComponent(arg)}/cancel`);
      return out(`Cancelación solicitada para ${arg}`);
    case 'retry':
      await api.post(`/api/executions/${encodeURIComponent(arg)}/retry`);
      return out(`Reintento solicitado para ${arg}`);
    case 'approvals': {
      const rows = await api.get(`/api/approvals${opts.all ? '' : '?status=OPEN'}`);
      if (opts.json) return json(rows);
      if (!rows.length) return out('No hay aprobaciones pendientes.');
      return table(
        rows.map((r: any) => ({ id: approvalLabel(r.number), title: r.title, status: r.status, ex: r.execution ? executionLabel(r.execution.number) : '—', pend: r.counts.PENDING ?? 0, n: r.itemCount })),
        [
          ['id', 'Id', 7],
          ['status', 'Estado', 17],
          ['ex', 'Ejecución', 9],
          ['pend', 'Pend.', 5],
          ['n', 'Ítems', 5],
          ['title', 'Título', 70],
        ],
      );
    }
    case 'approval': {
      const r = await api.get(`/api/approvals/${encodeURIComponent(arg)}`);
      if (opts.json) return json(r);
      out(`${approvalLabel(r.number)} · ${r.title} · ${r.status}`);
      out(`${r.summary}`);
      out(`Hash de confirmación: ${r.decisionHash.slice(0, 12)}  (usalo con --confirm)`);
      out('');
      for (const i of r.items) {
        out(`[${i.status}] ${i.itemKey} · ${i.group} · ${i.title}`);
        out(`    operación ${i.operationType} · política ${i.policyMode}${i.policyMode === 'ALWAYS_APPROVE' ? ' (requiere aprobación individual)' : ''} · revisión ${i.revision}`);
        const p = i.payload;
        if (p.summary) out(`    resumen: ${p.summary}`);
        if (p.parentKey || p.parentRef) out(`    padre: ${p.parentKey ?? p.parentRef}`);
        if (i.note) out(`    nota: ${i.note}`);
      }
      return;
    }
    case 'approve':
    case 'reject': {
      if (!arg) throw new Error('Indicá la solicitud (AP-n o número)');
      const id = arg.replace(/^AP-/i, '');
      if (!opts.confirm) throw new Error('Falta --confirm <hash>. Revisá primero el contenido con: pnpm mao approval ' + id);
      const r = await api.get(`/api/approvals/${encodeURIComponent(id)}`);
      const pending = r.items.filter((i: any) => i.status === 'PENDING' || i.status === 'CONFLICT');
      let selected: any[];
      if (opts.items) {
        const keys = String(opts.items).split(',').map((s) => s.trim());
        selected = pending.filter((i: any) => keys.includes(i.itemKey) || keys.includes(i.id));
        if (selected.length !== keys.length) throw new Error('Algún ítem no existe o no está pendiente');
      } else if (cmd === 'approve' && opts.batch) {
        selected = pending.filter((i: any) => i.policyMode !== 'ALWAYS_APPROVE');
        const individual = pending.filter((i: any) => i.policyMode === 'ALWAYS_APPROVE');
        if (individual.length) out(`Requieren aprobación individual (usá --items): ${individual.map((i: any) => i.itemKey).join(', ')}`);
      } else if (cmd === 'reject' && opts.all) selected = pending;
      else throw new Error(cmd === 'approve' ? 'Indicá --items a,b o --batch' : 'Indicá --items a,b o --all');
      if (!selected.length) return out('No hay ítems para decidir.');
      const body = { approve: cmd === 'approve' ? selected.map((i: any) => i.id) : [], reject: cmd === 'reject' ? selected.map((i: any) => i.id) : [], comment: String(opts.comment ?? ''), confirmHash: String(opts.confirm) };
      const res = await api.post(`/api/approvals/${encodeURIComponent(id)}/decisions`, body);
      return out(`${cmd === 'approve' ? 'Aprobados' : 'Rechazados'} ${selected.length} ítem(s). Estado de la solicitud: ${res.status}`);
    }
    case 'proposals': {
      const rows = await api.get('/api/proposals');
      if (opts.json) return json(rows);
      return table(
        rows.map((p: any) => ({ id: `CP-${p.number}`, kind: p.kind, key: p.targetKey, status: p.status, title: p.title, ok: p.verification?.passed ? 'sí' : 'no' })),
        [
          ['id', 'Id', 6],
          ['kind', 'Tipo', 12],
          ['key', 'Clave', 24],
          ['status', 'Estado', 16],
          ['ok', 'Verif.', 6],
          ['title', 'Título', 50],
        ],
      );
    }
    case 'usage': {
      const n = (v: number) => fmtNumber(v ?? 0);
      const cols: [string, string, number][] = [
        ['group', '', 26],
        ['calls', 'Invoc.', 8],
        ['input', 'Entrada', 10],
        ['cache', 'Caché escr./leída', 22],
        ['output', 'Salida', 10],
        ['total', 'Total', 12],
        ['cost', 'Costo est.', 12],
      ];
      const rowsOf = (list: any[], key: string, label: (v: string) => string = (v) => v) =>
        list.map((r) => ({ group: label(r[key]), calls: `${r.invocations}${r.failed ? ` (${r.failed}!)` : ''}`, input: n(r.inputTokens), cache: `${n(r.cacheCreationInputTokens)} / ${n(r.cacheReadInputTokens)}`, output: n(r.outputTokens), total: n(r.totalTokens), cost: `USD ${fmtNumber(r.costUsd, 2)}` }));
      const totalsLine = (t: any) =>
        `Total: ${n(t.totalTokens)} tokens · salida ${n(t.outputTokens)} · entrada ${n(t.inputTokens)} · caché ${n(t.cacheCreationInputTokens)} escrita / ${n(t.cacheReadInputTokens)} leída · ${t.invocations} invocaciones${t.failed ? ` (${t.failed} fuera de contrato)` : ''} · costo estimado USD ${fmtNumber(t.costUsd, 2)}`;
      const note = 'Costo estimado = equivalente API informado por el proveedor; con sesión de claude.ai (suscripción) no es un cargo.';
      if (arg) {
        const u = await api.get(`/api/executions/${encodeURIComponent(arg)}/usage`);
        if (opts.json) return json(u);
        out(`${executionLabel(u.number)} · consumo de tokens${u.models.length ? ` (${u.models.join(', ')})` : ''}`);
        out(totalsLine(u.totals));
        out('');
        table(rowsOf(u.byAgent, 'agentKey'), [['group', 'Agente', 26], ...cols.slice(1)]);
        out(`\n(N!) = respuestas fuera de contrato, que igual consumieron tokens. ${note}`);
        return;
      }
      const q = new URLSearchParams({ days: String(opts.days ?? 30) });
      if (opts.project) q.set('project', String(opts.project));
      const s = await api.get(`/api/usage?${q}`);
      if (opts.json) return json(s);
      out(`Consumo de los últimos ${s.days} días${s.projectKey ? ` · proyecto ${s.projectKey}` : ''}`);
      out(totalsLine(s.totals));
      out('');
      table(rowsOf(s.byAgent, 'agentKey'), [['group', 'Agente', 26], ...cols.slice(1)]);
      out('');
      const ORIGIN: Record<string, string> = { EXECUTION: 'Ejecuciones', SUPERVISOR_PLAN: 'Planificación supervisor', CATALOG_TEST: 'Pruebas de catálogo' };
      table(rowsOf(s.byOrigin, 'origin', (v) => ORIGIN[v] ?? v), [['group', 'Origen', 26], ...cols.slice(1)]);
      if (s.topExecutions.length) {
        out('\nEjecuciones con más consumo:');
        for (const t of s.topExecutions.slice(0, 5)) out(`  ${t.number ? executionLabel(t.number) : '—'}  ${t.orchestratorKey ?? ''} · ${t.projectKey ?? ''} · ${n(t.totalTokens)} tokens · USD ${fmtNumber(t.costUsd, 2)}`);
      }
      out(`\n${note}`);
      return;
    }
    case 'files':
      return files(arg);
    default:
      out(`Comando desconocido: ${cmd}\n`);
      out(HELP);
      process.exitCode = 2;
  }
}

main().catch((err) => {
  if (err instanceof ApiError) console.error(`Error ${err.code}: ${err.message}${err.details ? `\n${JSON.stringify(err.details, null, 2)}` : ''}`);
  else console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
