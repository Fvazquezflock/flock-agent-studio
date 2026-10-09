import type { ProjectConfig, Specialty, TaskProposal, ValidationIssue } from '@mao/shared';
import type { JiraIssueRef } from '../../jira/types';
import { topologicalLayers } from '../../catalog/validation';
import { jaccard, normalize, overlap, sameCapability, shorten, stripDot, tokens } from './text';

const isIssueKey = (x: string) => /^[A-Z][A-Z0-9_]+-\d+$/.test(x);

type Ctx = Record<string, any>;

export interface StoryLike {
  ref: string;
  title: string;
  description?: string;
  acceptanceCriteria: string[];
  businessRules?: string[];
  actor?: string;
  dependencies?: string[];
  questions?: string[];
}

const UI_SIGNALS = /(consult|ver |visualiz|pantalla|panel|formulario|reserv|cancel|reprogram|eleg|seleccion|configur|calendario)/i;
const NON_UI_SIGNALS = /(recordatorio|notificaci|email|correo|batch|proceso automático|job)/i;
const BACKEND_SIGNALS = /(registr|guard|reserv|cancel|reprogram|envi|notific|configur|valid|regla|api|legado|integr|persist|consult|turno|horario)/i;
const INTEGRATION_SIGNALS = /(legado|oracle|pkg_|integraci|sistema externo|erp|sap)/i;

function storyText(s: StoryLike): string {
  return [s.title, s.description ?? '', ...(s.acceptanceCriteria ?? []), ...(s.businessRules ?? [])].join('\n');
}

function makeTask(spec: Specialty, story: StoryLike, n: number, config: ProjectConfig, extra: Partial<TaskProposal>): TaskProposal {
  const prefix = config.templates.taskTitlePrefix[spec];
  return {
    ref: `${spec[0]}${spec === 'FULLSTACK' ? 'S' : ''}${n}`,
    storyRef: story.ref,
    specialty: spec,
    title: `${prefix} ${extra.title}`,
    objective: extra.objective ?? '',
    scope: extra.scope ?? '',
    activities: extra.activities ?? [],
    doneCriteria: extra.doneCriteria ?? [],
    dependencies: extra.dependencies ?? [],
    risks: extra.risks ?? [],
    duplicateOf: extra.duplicateOf,
    rationale: extra.rationale ?? `${story.ref} necesita trabajo de ${spec.toLowerCase()} para cumplir sus criterios de aceptación y no hay una tarea existente que lo cubra.`,
    evidence: extra.evidence ?? [`Historia ${story.ref}: "${shorten(story.title, 60)}"`],
  };
}

/**
 * Tarea equivalente existente. Si las tareas existentes son subtareas de la misma historia (flujo B),
 * alcanza con compartir especialidad y la acción principal; si son de otras historias, se exige alta similitud.
 */
function findDuplicate(title: string, spec: Specialty, existing: JiraIssueRef[], config: ProjectConfig, sameStory: boolean, storyTitle: string): string | undefined {
  const prefix = config.templates.taskTitlePrefix[spec];
  const cand = existing.filter((e) => (e.summary ?? '').startsWith(prefix));
  const verb = tokens(storyTitle.split(/\s+/)[0] ?? '');
  const hit = cand.find((e) => {
    const other = (e.summary ?? '').replace(prefix, '');
    if (jaccard(title, other) >= 0.5) return true;
    return sameStory && [...verb].some((v) => tokens(other).has(v));
  });
  return hit?.key;
}

export function technicalBreakdown(ctx: Ctx) {
  const spec = ctx.specialty as Specialty;
  const stories = (ctx.stories ?? []) as StoryLike[];
  const existing = (ctx.existingTasks ?? []) as JiraIssueRef[];
  const config = ctx.config as ProjectConfig;
  const epicRules = (ctx.epicRules ?? []) as string[];
  const tasks: TaskProposal[] = [];
  const notApplicable: { storyRef: string; reason: string }[] = [];
  let n = 0;

  for (const s of stories) {
    const text = storyText(s);
    const subject = shorten(s.title, 60);
    const rules = [...(s.businessRules ?? []), ...epicRules.filter((r) => overlap(r, s.title) >= 1)];
    const uniqueRules = [...new Set(rules)];
    if (spec === 'BACKEND') {
      if (!BACKEND_SIGNALS.test(text)) {
        notApplicable.push({ storyRef: s.ref, reason: 'La historia no requiere lógica de servidor ni persistencia nueva.' });
        continue;
      }
      const title = `${subject}: API y reglas de negocio`;
      tasks.push(
        makeTask(spec, s, ++n, config, {
          title,
          objective: `Exponer y validar en el backend la operación "${subject}".`,
          scope: 'Contrato de API, validaciones de negocio, persistencia y auditoría. No incluye la interfaz de usuario.',
          activities: [
            'Definir el contrato de la API (request, response y códigos de error).',
            ...uniqueRules.map((r) => `Implementar la regla: ${stripDot(r)}.`),
            'Registrar la operación en auditoría.',
            'Escribir pruebas unitarias y de integración.',
          ],
          doneCriteria: [...s.acceptanceCriteria.slice(0, 3).map((c) => `Cubre: ${shorten(c, 120)}`), 'Pruebas automatizadas en verde.'],
          risks: INTEGRATION_SIGNALS.test(uniqueRules.join(' ')) ? ['Dependencia de la disponibilidad del sistema legado.'] : [],
          duplicateOf: findDuplicate(title, spec, existing, config, isIssueKey(s.ref), s.title),
        }),
      );
    } else if (spec === 'FRONTEND') {
      if (NON_UI_SIGNALS.test(s.title) && !UI_SIGNALS.test(s.title)) {
        notApplicable.push({ storyRef: s.ref, reason: 'La historia es un proceso automático sin interacción de interfaz.' });
        continue;
      }
      if (!UI_SIGNALS.test(text)) {
        notApplicable.push({ storyRef: s.ref, reason: 'No se identifican pantallas ni interacciones de usuario.' });
        continue;
      }
      const title = `${subject}: pantalla y flujo de usuario`;
      tasks.push(
        makeTask(spec, s, ++n, config, {
          title,
          objective: `Permitir que ${(s.actor ?? 'la persona usuaria').toLowerCase()} complete "${subject}" desde el portal.`,
          scope: 'Pantalla, estados de carga, vacío y error, validaciones de formulario y accesibilidad. Consume la API del backend.',
          activities: [
            'Maquetar la pantalla con los componentes del design system.',
            'Implementar estados de carga, vacío y error con mensajes accionables.',
            'Validar el formulario antes de enviar.',
            'Verificar accesibilidad (foco, etiquetas, contraste).',
          ],
          doneCriteria: [...s.acceptanceCriteria.slice(0, 2).map((c) => `Cubre: ${shorten(c, 120)}`), 'Revisión de UX aprobada.'],
          dependencies: [],
          duplicateOf: findDuplicate(title, spec, existing, config, isIssueKey(s.ref), s.title),
        }),
      );
    } else if (spec === 'FULLSTACK') {
      const integ = uniqueRules.find((r) => INTEGRATION_SIGNALS.test(r)) ?? (INTEGRATION_SIGNALS.test(text) ? text.split('\n').find((l) => INTEGRATION_SIGNALS.test(l)) : undefined);
      if (!integ) {
        notApplicable.push({ storyRef: s.ref, reason: 'Backend y Frontend cubren el alcance; no hay trabajo transversal.' });
        continue;
      }
      const title = `${subject}: integración con sistema legado`;
      tasks.push(
        makeTask(spec, s, ++n, config, {
          title,
          objective: 'Integrar la operación con el sistema legado de punta a punta.',
          scope: `Adaptador de integración, manejo de errores y reintentos. Origen: ${stripDot(integ)}.`,
          activities: ['Relevar el contrato del sistema legado.', 'Implementar el adaptador con timeouts y reintentos controlados.', 'Definir el comportamiento ante indisponibilidad.', 'Prueba de punta a punta.'],
          doneCriteria: ['La operación queda registrada en el sistema legado.', 'Los errores del legado se informan con un mensaje accionable.'],
          risks: ['Contrato del sistema legado no documentado.', 'Latencia del sistema legado.'],
          evidence: [`Regla: "${stripDot(integ)}"`],
          duplicateOf: findDuplicate(title, spec, existing, config, isIssueKey(s.ref), s.title),
        }),
      );
    }
  }
  return { tasks, notApplicable };
}

function qaTaskFor(story: StoryLike, n: number, config: ProjectConfig, existing: JiraIssueRef[]): TaskProposal {
  const title = `Casos de prueba: ${shorten(story.title, 60)}`;
  return makeTask('QA', story, n, config, {
    title,
    objective: 'Verificar los criterios de aceptación con casos de prueba trazables.',
    scope: 'Casos funcionales, casos negativos y regresión del flujo.',
    activities: story.acceptanceCriteria.map((c, i) => `Caso ${i + 1}: ${shorten(c, 140)}`),
    doneCriteria: ['Cada criterio de aceptación tiene al menos un caso ejecutado.', 'Defectos registrados y vinculados.'],
    duplicateOf: findDuplicate(title, 'QA', existing, config, isIssueKey(story.ref), story.title),
  });
}

export function validatePlan(ctx: Ctx) {
  const stories = (ctx.stories ?? []) as StoryLike[];
  const tasks = (ctx.tasks ?? []) as TaskProposal[];
  const existingStories = (ctx.existingStories ?? []) as JiraIssueRef[];
  const existingTasks = (ctx.existingTasks ?? []) as JiraIssueRef[];
  const config = ctx.config as ProjectConfig;
  const issues: ValidationIssue[] = [];
  const refs = new Set([...stories.map((s) => s.ref), ...existingStories.map((s) => s.key)]);

  for (const s of stories) {
    if (s.acceptanceCriteria.length < config.templates.minAcceptanceCriteria) {
      issues.push({ severity: 'error', type: 'MISSING_AC', refs: [s.ref], message: `"${shorten(s.title, 60)}" tiene ${s.acceptanceCriteria.length} criterio(s); el mínimo es ${config.templates.minAcceptanceCriteria}.`, suggestion: 'Agregar criterios verificables.' });
    }
    if (s.acceptanceCriteria.length > 6 || (s.businessRules ?? []).length > 3 || / y (reprogram|cancel|consult|reserv)/i.test(s.title)) {
      issues.push({ severity: 'warning', type: 'TOO_BROAD', refs: [s.ref], message: `"${shorten(s.title, 60)}" parece demasiado amplia.`, suggestion: 'Dividirla en historias más chicas.' });
    }
    const dup = existingStories.find((e) => sameCapability(s.title, e.summary ?? ''));
    if (dup) issues.push({ severity: 'warning', type: 'DUPLICATE', refs: [s.ref, dup.key], message: `"${shorten(s.title, 60)}" se parece a ${dup.key}.`, suggestion: 'Confirmar que no duplica una historia existente.' });
    for (const d of s.dependencies ?? []) {
      if (!refs.has(d)) issues.push({ severity: 'error', type: 'DEPENDENCY', refs: [s.ref, d], message: `Dependencia desconocida ${d}.`, suggestion: 'Corregir la referencia.' });
    }
    if ((s.questions ?? []).length) {
      issues.push({ severity: 'warning', type: 'NEEDS_CLARIFICATION', refs: [s.ref], message: `Preguntas abiertas: ${(s.questions ?? []).join(' ')}`, suggestion: 'Resolver con negocio antes de comprometerla en un sprint.' });
    }
    if (!tasks.some((t) => t.storyRef === s.ref)) {
      issues.push({ severity: 'warning', type: 'INCONSISTENCY', refs: [s.ref], message: `"${shorten(s.title, 60)}" no tiene tareas técnicas.`, suggestion: 'Revisar la descomposición técnica.' });
    }
  }
  for (const t of tasks) {
    if (!stories.some((s) => s.ref === t.storyRef)) issues.push({ severity: 'error', type: 'INCONSISTENCY', refs: [t.ref], message: `La tarea ${t.ref} apunta a una historia inexistente (${t.storyRef}).`, suggestion: 'Reasignar la tarea.' });
    if (t.duplicateOf) issues.push({ severity: 'info', type: 'DUPLICATE', refs: [t.ref, t.duplicateOf], message: `${t.ref} equivale a la tarea existente ${t.duplicateOf}; no se propone crearla.`, suggestion: '' });
  }
  const contradictions = stories.flatMap((a) => stories.filter((b) => a.ref < b.ref && /hasta (\d+) horas?/i.test(storyText(a)) && /hasta (\d+) horas?/i.test(storyText(b)) && /hasta (\d+) horas?/i.exec(storyText(a))![1] !== /hasta (\d+) horas?/i.exec(storyText(b))![1]).map((b) => [a, b] as const));
  for (const [a, b] of contradictions) issues.push({ severity: 'warning', type: 'CONTRADICTION', refs: [a.ref, b.ref], message: 'Las historias usan plazos distintos para la misma regla.', suggestion: 'Unificar el plazo.' });

  let q = 0;
  const qaTasks = stories.filter((s) => s.acceptanceCriteria.length).map((s) => qaTaskFor(s, ++q, config, existingTasks));
  const coverage = stories.map((s) => ({ storyRef: s.ref, covered: tasks.some((t) => t.storyRef === s.ref) && s.acceptanceCriteria.length > 0, notes: s.acceptanceCriteria.length ? `${s.acceptanceCriteria.length} criterio(s) con casos de prueba` : 'Sin criterios para probar' }));
  const verdict = issues.some((i) => i.severity !== 'info') ? 'NEEDS_ATTENTION' : 'OK';
  return { verdict, issues, qaTasks, coverage };
}

export function dependencyPlan(ctx: Ctx) {
  const stories = (ctx.stories ?? []) as StoryLike[];
  const tasks = (ctx.tasks ?? []) as TaskProposal[];
  const deps: { from: string; to: string; type: 'blocks' | 'relates'; reason: string }[] = [];
  const known = new Set([...stories.map((s) => s.ref), ...tasks.map((t) => t.ref)]);
  for (const s of stories) for (const d of s.dependencies ?? []) deps.push({ from: d, to: s.ref, type: 'blocks', reason: `"${shorten(s.title, 50)}" requiere ${d}` });
  for (const t of tasks) {
    for (const d of t.dependencies) deps.push({ from: d, to: t.ref, type: 'blocks', reason: `${t.ref} requiere ${d}` });
    if (t.specialty === 'FRONTEND' || t.specialty === 'QA') {
      const be = tasks.find((x) => x.storyRef === t.storyRef && x.specialty === 'BACKEND' && !x.duplicateOf);
      if (be && be.ref !== t.ref) deps.push({ from: be.ref, to: t.ref, type: 'blocks', reason: `${t.ref} consume la API de ${be.ref}` });
    }
    if (t.specialty === 'QA') {
      const fe = tasks.find((x) => x.storyRef === t.storyRef && x.specialty === 'FRONTEND' && !x.duplicateOf);
      if (fe) deps.push({ from: fe.ref, to: t.ref, type: 'blocks', reason: `${t.ref} prueba la pantalla de ${fe.ref}` });
    }
  }
  const nodes = [...known];
  const graph = new Map<string, string[]>(nodes.map((n) => [n, deps.filter((d) => d.to === n && known.has(d.from)).map((d) => d.from)]));
  const { layers, cyclic } = topologicalLayers(nodes, graph);
  const waves = (layers ?? [nodes]).map((refs, i) => ({ wave: i + 1, refs }));
  const notes = deps.filter((d) => !known.has(d.from)).map((d) => `${d.to} depende de ${d.from}, que ya existe en Jira.`);
  return { waves, dependencies: deps, cycles: cyclic.length ? [cyclic] : [], notes };
}

export function qaCoverage(ctx: Ctx) {
  const criteria = (ctx.criteria ?? []) as string[];
  const tasks = (ctx.tasks ?? []) as TaskProposal[];
  const existing = (ctx.existingTasks ?? []) as JiraIssueRef[];
  const story = ctx.story as StoryLike;
  const config = ctx.config as ProjectConfig;
  const coverage = criteria.map((c) => {
    const by = tasks.filter((t) => [...t.activities, ...t.doneCriteria, t.title].some((x) => overlap(x, c) >= 2)).map((t) => t.ref);
    const ex = existing.filter((e) => overlap(e.summary ?? '', c) >= 2).map((e) => e.key);
    const all = [...by, ...ex];
    return { criterion: c, coveredBy: all, gap: all.length ? undefined : 'Ninguna tarea implementa explícitamente este criterio.' };
  });
  const issues: ValidationIssue[] = coverage
    .filter((c) => c.gap)
    .map((c) => ({ severity: 'warning' as const, type: 'COVERAGE' as const, refs: [story.ref], message: `Criterio sin cobertura: ${shorten(c.criterion, 100)}`, suggestion: 'Asignarlo a una tarea o agregar una.' }));
  const hasQa = existing.some((e) => (e.summary ?? '').startsWith(config.templates.taskTitlePrefix.QA)) || tasks.some((t) => t.specialty === 'QA');
  const qaTasks = hasQa ? [] : [qaTaskFor({ ...story, acceptanceCriteria: criteria }, 1, config, existing)];
  const missingTests = criteria.some((c) => /mismo horario|concurren|simult/i.test(normalize(c)))
    ? ['Prueba de concurrencia: dos clientes reservando el mismo horario al mismo tiempo.']
    : [];
  if (tokens(criteria.join(' ')).has('legad') || criteria.some((c) => /legado/i.test(c))) missingTests.push('Prueba con el sistema legado no disponible (timeout y mensaje al usuario).');
  return { coverage, missingTests, qaTasks, issues };
}
