import type { ProjectConfig, StoryProposal } from '@mao/shared';
import type { JiraIssue } from '../../jira/types';
import { capitalize, findSection, findVague, looksLikeInjection, lowerFirst, mainVerb, overlap, sameCapability, sections, shorten, stripDot } from './text';

type Ctx = Record<string, any>;

export function summarizeContext(ctx: Ctx) {
  const root = ctx.root as JiraIssue;
  const children = (ctx.children ?? []) as JiraIssue[];
  const related = (ctx.related ?? []) as JiraIssue[];
  const all = [root, ...children, ...related];
  const warnings = all
    .filter((i) => looksLikeInjection(`${i.summary}\n${i.description}`))
    .map((i) => `${i.key} contiene texto con instrucciones dirigidas a sistemas automáticos. Se trató como dato no confiable y no se ejecutó.`);
  const gaps: string[] = [];
  if (!root.description.trim()) gaps.push(`${root.key} no tiene descripción`);
  for (const c of children) if (!c.description.trim()) gaps.push(`${c.key} no tiene descripción`);
  if (ctx.mode === 'story' && !/criterio/i.test(root.description)) gaps.push(`${root.key} no declara criterios de aceptación`);
  return {
    summary: `${root.issueType} ${root.key} "${root.summary}" en estado ${root.status || 'sin estado'}, con ${children.length} issue(s) hija(s) y ${root.links.length} vínculo(s).`,
    keyFacts: [
      { fact: `Estado: ${root.status || '—'}`, source: `${root.key}.status` },
      { fact: `Tipo: ${root.issueType}`, source: `${root.key}.issuetype` },
      ...(root.parentKey ? [{ fact: `Pertenece a ${root.parentKey}`, source: `${root.key}.parent` }] : []),
      ...root.links.map((l) => ({ fact: `${l.label} ${l.issue.key}${l.issue.status ? ` (${l.issue.status})` : ''}`, source: `${root.key}.issuelinks` })),
    ],
    existingItems: [...children, ...root.subtasks.map((s) => ({ ...s, issueType: s.issueType ?? 'Sub-task' }))].map((c) => ({ key: c.key, type: c.issueType ?? '', summary: c.summary ?? '' })),
    gaps,
    untrustedContentWarnings: warnings,
  };
}

function capabilitiesOf(epic: JiraIssue): string[] {
  const secs = sections(epic.description);
  const scope = findSection(secs, 'alcance', 'requerim', 'funcional', 'scope');
  const bullets = scope?.bullets.length ? scope.bullets : secs.flatMap((s) => s.bullets);
  return bullets.map(stripDot);
}

export function functionalAnalysis(ctx: Ctx) {
  const epic = ctx.epic as JiraIssue;
  const existing = (ctx.existingStories ?? []) as JiraIssue[];
  const secs = sections(epic.description);
  const objective = findSection(secs, 'objetivo', 'goal');
  const rules = findSection(secs, 'regla', 'negocio', 'rules');
  const pending = findSection(secs, 'pendiente', 'definir', 'duda', 'pregunta');
  const caps = capabilitiesOf(epic);
  const covered = (cap: string) => existing.find((s) => sameCapability(cap, s.summary));
  return {
    objectives: objective ? [...objective.lines, ...objective.bullets].map(stripDot) : [stripDot(epic.summary)],
    capabilities: caps.map((c) => {
      const cov = covered(c);
      return { name: shorten(c, 60), description: c, source: cov ? `${epic.key} (cubierta por ${cov.key})` : `${epic.key} › Alcance` };
    }),
    businessRules: (rules?.bullets ?? []).map((r) => ({ rule: stripDot(r), source: `${epic.key} › Reglas de negocio` })),
    missingFunctionality: caps.filter((c) => !covered(c)).map((c) => `Sin historia que cubra: ${c}`),
    ambiguities: findVague(epic.description).map((v) => ({ text: v.sentence, question: v.question })),
    openQuestions: (pending?.bullets ?? []).map(stripDot),
  };
}

function actorFor(text: string, epic: JiraIssue): string {
  if (/administrador/i.test(text)) return 'Administrador de sucursal';
  if (/cliente/i.test(text) || /cliente/i.test(epic.description)) return 'Cliente';
  return 'Usuario';
}

function criteriaFor(cap: string, actor: string, rules: string[], format: ProjectConfig['templates']['acceptanceCriteriaFormat'], min: number): string[] {
  const action = lowerFirst(stripDot(cap));
  const out: string[] = [];
  const g = format === 'gherkin';
  out.push(g ? `Dado que soy ${actor.toLowerCase()} autenticado, cuando solicito ${action}, entonces la operación se confirma y veo el resultado actualizado.` : `Se puede ${action} y se confirma el resultado.`);
  for (const r of rules.slice(0, 2)) {
    out.push(g ? `Dado que no se cumple la regla "${stripDot(r)}", cuando intento ${action}, entonces el sistema lo impide y explica el motivo.` : `Se respeta la regla: ${stripDot(r)}.`);
  }
  while (out.length < min) {
    out.push(g ? `Dado que ocurre un error del sistema, cuando intento ${action}, entonces veo un mensaje que indica qué pasó y cómo seguir, sin perder los datos ingresados.` : `Ante un error se informa qué pasó y cómo seguir.`);
  }
  return out;
}

const DEPENDENT_VERBS = ['cance', 'repro', 'modif', 'envia', 'recor', 'notif'];

export function generateStories(ctx: Ctx) {
  const epic = ctx.epic as JiraIssue;
  const existing = (ctx.existingStories ?? []) as JiraIssue[];
  const config = ctx.config as ProjectConfig;
  const analysis = ctx.analysis as ReturnType<typeof functionalAnalysis> | undefined;
  const rules = (analysis?.businessRules ?? []).map((r) => r.rule);
  const questions = analysis?.openQuestions ?? [];
  const caps = capabilitiesOf(epic).filter((c) => !existing.some((s) => sameCapability(c, s.summary)));
  const notes: string[] = [];
  if (ctx.feedback) notes.push(`Regenerado con la observación de revisión: "${String(ctx.feedback)}"`);
  if (ctx.instructions) notes.push(`Instrucciones complementarias consideradas: "${String(ctx.instructions)}"`);

  const stories: StoryProposal[] = caps.map((cap, i) => {
    const actor = actorFor(cap, epic);
    const related = rules.filter((r) => overlap(r, cap) >= 1);
    const relQuestions = questions.filter((q) => overlap(q, cap) >= 1);
    const ac = criteriaFor(cap, actor, related, config.templates.acceptanceCriteriaFormat, config.templates.minAcceptanceCriteria);
    if (ctx.feedback && /criterio/i.test(String(ctx.feedback))) {
      ac.push(`Dado que la operación se completó, cuando consulto el historial, entonces queda registrada con fecha, hora y responsable.`);
    }
    const deps: string[] = [];
    const verb = mainVerb(cap).slice(0, 5);
    if (DEPENDENT_VERBS.includes(verb)) {
      const base = existing.find((s) => /reserv|alta|crear/i.test(s.summary));
      if (base) deps.push(base.key);
    }
    return {
      ref: `S${i + 1}`,
      title: shorten(capitalize(cap), 90),
      description: `Como ${actor.toLowerCase()} quiero ${lowerFirst(stripDot(cap))} para resolverlo desde el portal sin intervención del call center.`,
      objective: `Que ${actor === 'Cliente' ? 'el cliente' : `el ${actor.toLowerCase()}`} pueda ${lowerFirst(stripDot(cap))}.`,
      actor,
      expectedBehavior: `El sistema permite ${lowerFirst(stripDot(cap))}${related.length ? ` respetando: ${related.map((r) => lowerFirst(r)).join('; ')}` : ''}.`,
      acceptanceCriteria: ac,
      businessRules: related,
      dependencies: deps,
      assumptions: relQuestions.length ? [] : ['Se reutiliza la autenticación existente del portal.'],
      questions: relQuestions,
      epicRelation: `Implementa el alcance "${shorten(cap, 70)}" de ${epic.key}.`,
      rationale: `El alcance de ${epic.key} pide "${stripDot(cap)}" y ninguna historia existente de la épica lo cubre.`,
      evidence: [`${epic.key} › Alcance solicitado: "${stripDot(cap)}"`, ...related.map((r) => `${epic.key} › Regla: "${r}"`)],
    };
  });

  // Dependencias entre historias nuevas: reprogramar/cancelar dependen de reservar si se generó.
  const reserve = stories.find((s) => mainVerb(s.title).startsWith('reser'));
  for (const s of stories) if (reserve && s !== reserve && DEPENDENT_VERBS.includes(mainVerb(s.title).slice(0, 5))) s.dependencies.push(reserve.ref);
  if (!stories.length) notes.push('Todas las capacidades de la épica ya tienen historias asociadas.');
  return { stories, notes };
}
