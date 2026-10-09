import type { ProjectConfig } from '@mao/shared';
import type { JiraIssue } from '../../jira/types';
import { findSection, findVague, lowerFirst, normalize, overlap, sections, similarity, stripDot } from './text';

type Ctx = Record<string, any>;
type Severity = 'HIGH' | 'MEDIUM' | 'LOW';

function criteriaOf(description: string): string[] {
  const secs = sections(description);
  const sec = findSection(secs, 'criterio', 'acceptance');
  return (sec?.bullets ?? []).map(stripDot);
}

function epicRules(parent?: JiraIssue): string[] {
  if (!parent) return [];
  const sec = findSection(sections(parent.description), 'regla', 'negocio');
  return (sec?.bullets ?? []).map(stripDot);
}

function epicCapability(story: JiraIssue, parent?: JiraIssue): string | undefined {
  if (!parent) return undefined;
  const sec = findSection(sections(parent.description), 'alcance', 'requerim');
  return (sec?.bullets ?? []).map(stripDot).sort((a, b) => similarity(story.summary, b) - similarity(story.summary, a))[0];
}

export function storyReview(ctx: Ctx) {
  const story = ctx.story as JiraIssue;
  const parent = ctx.parent as JiraIssue | undefined;
  const config = ctx.config as ProjectConfig;
  const desc = story.description;
  const problems: { id: string; area: any; severity: Severity; description: string; evidence: string }[] = [];
  let n = 0;
  const add = (area: string, severity: Severity, description: string, evidence = '') => problems.push({ id: `P${++n}`, area, severity, description, evidence });

  const hasUserStory = /como\s+.+\s+quiero\s+.+/i.test(normalize(desc));
  if (!hasUserStory) add('CLARITY', 'MEDIUM', 'No identifica actor, objetivo y beneficio (formato "Como… quiero… para…").', desc.split('\n')[0] ?? '');
  const criteria = criteriaOf(desc);
  const gherkin = criteria.filter((c) => /dado.*cuando.*entonces/i.test(normalize(c)));
  if (!criteria.length) add('ACCEPTANCE_CRITERIA', 'HIGH', 'No tiene criterios de aceptación.');
  else if (gherkin.length < criteria.length) add('ACCEPTANCE_CRITERIA', 'HIGH', `${criteria.length - gherkin.length} de ${criteria.length} criterios no son verificables (sin condición, acción y resultado).`, criteria.join(' | '));
  for (const v of findVague(desc)) add('AMBIGUITY', 'HIGH', `Término ambiguo "${v.term}". ${v.question}`, v.sentence);
  if (!/(error|falla|no disponible|sin |rechaz|ya (est|tom)|ocupad)/i.test(desc.replace(/algo falla/i, ''))) add('ALTERNATIVE_FLOWS', 'MEDIUM', 'No describe flujos alternativos (horario ya tomado, límite alcanzado, sistema no disponible).');
  if (/validar todo|todo lo necesario/i.test(desc) || !/valid/i.test(desc)) add('VALIDATIONS', 'MEDIUM', 'Las validaciones no están enumeradas.', /valid.*$/im.exec(desc)?.[0] ?? '');
  const missingRules = epicRules(parent).filter((r) => overlap(r, `${story.summary} ${desc}`) >= 1 && !desc.toLowerCase().includes(r.toLowerCase().slice(0, 20)));
  for (const r of missingRules) add('COMPLETENESS', 'HIGH', `No refleja la regla de negocio de la épica: "${r}".`, `${parent!.key} › Reglas de negocio`);
  for (const l of story.links) {
    const done = /listo|done|hecho|cerrad/i.test(l.issue.status ?? '');
    add('DEPENDENCIES', done ? 'LOW' : 'MEDIUM', `${l.label} ${l.issue.key}${l.issue.status ? ` (${l.issue.status})` : ''}${done ? ': dependencia resuelta.' : ': dependencia abierta.'}`, `${story.key}.issuelinks`);
  }

  const dor = (config.definitionOfReady.length ? config.definitionOfReady : ['Tiene criterios de aceptación verificables', 'Identifica actor y objetivo', 'Dependencias identificadas']).map((item) => {
    const k = normalize(item);
    if (k.includes('criterio')) return { item, met: criteria.length > 0 && gherkin.length === criteria.length, note: gherkin.length === criteria.length ? '' : 'Criterios no verificables' };
    if (k.includes('actor') || k.includes('objetivo') || k.includes('formato')) return { item, met: hasUserStory, note: hasUserStory ? '' : 'Falta formato de historia' };
    if (k.includes('dependen')) return { item, met: true, note: story.links.length ? `${story.links.length} vínculo(s)` : 'Sin dependencias declaradas' };
    if (k.includes('ambig')) return { item, met: !findVague(desc).length, note: '' };
    if (k.includes('regla')) return { item, met: !missingRules.length, note: missingRules.length ? `${missingRules.length} regla(s) de la épica sin reflejar` : '' };
    if (k.includes('estim')) return { item, met: false, note: 'Sin estimación registrada' };
    return { item, met: false, note: 'No verificable automáticamente: revisión manual' };
  });

  const weight = { HIGH: 8, MEDIUM: 4, LOW: 1 } as const;
  const score = Math.max(0, 100 - problems.reduce((acc, p) => acc + weight[p.severity], 0));
  const readiness = score >= 80 ? 'READY' : score >= 50 ? 'PARTIAL' : 'NOT_READY';
  return {
    diagnosis: {
      summary: `${story.key} "${story.summary}": ${problems.filter((p) => p.severity === 'HIGH').length} problema(s) de severidad alta, ${problems.filter((p) => p.severity === 'MEDIUM').length} media. ${readiness === 'READY' ? 'Cumple la Definition of Ready.' : 'No cumple todavía la Definition of Ready.'}`,
      readiness,
      score,
    },
    problems,
    dorChecklist: dor,
  };
}

export function storyImprovements(ctx: Ctx) {
  const story = ctx.story as JiraIssue;
  const parent = ctx.parent as JiraIssue | undefined;
  const review = ctx.review as ReturnType<typeof storyReview>;
  const objective = ctx.objective ? String(ctx.objective) : '';
  const ids = (area: string) => review.problems.filter((p) => p.area === area).map((p) => p.id);
  const cap = epicCapability(story, parent);
  const rules = epicRules(parent).filter((r) => overlap(r, `${story.summary} ${story.description}`) >= 1 || /turnos activos/i.test(r));
  const actor = /cliente/i.test(`${story.description} ${parent?.description ?? ''}`) ? 'cliente' : 'usuario';
  const action = lowerFirst(stripDot(cap ?? story.summary));
  const changes: { field: 'summary' | 'description' | 'acceptanceCriteria'; original: string; proposed: string; justification: string; problemIds: string[] }[] = [];

  if (cap && cap.length > story.summary.length + 5) {
    changes.push({
      field: 'summary',
      original: story.summary,
      proposed: cap.replace(/^./, (c) => c.toUpperCase()),
      justification: `El título actual es genérico; se alinea con el alcance declarado en ${parent?.key}.`,
      problemIds: ids('CLARITY'),
    });
  }

  const rulesBlock = rules.length ? rules.map((r) => `- ${r}.`).join('\n') : '- (sin reglas heredadas de la épica)';
  const proposedDescription = [
    `Como ${actor} quiero ${action} para asegurar mi atención sin depender del call center.`,
    '',
    '## Reglas de negocio',
    rulesBlock,
    '',
    '## Flujos alternativos',
    '- El horario elegido fue tomado por otra persona mientras completaba la reserva.',
    '- El cliente ya tiene el máximo de turnos activos permitido.',
    '- El sistema de agenda no responde.',
    '',
    '## Validaciones',
    '- Sucursal, fecha y horario obligatorios.',
    '- La fecha no puede ser anterior a hoy.',
    '- El horario debe seguir disponible al confirmar.',
    ...(objective ? ['', '## Objetivo adicional de la revisión', objective] : []),
    '',
    '## Preguntas abiertas',
    '- Umbral de tiempo de respuesta esperado (se propone p95 menor a 2 s: confirmar).',
  ].join('\n');
  changes.push({
    field: 'description',
    original: story.description,
    proposed: proposedDescription,
    justification: 'Agrega actor y objetivo, hereda las reglas de negocio de la épica y enumera flujos alternativos y validaciones.',
    problemIds: [...ids('CLARITY'), ...ids('COMPLETENESS'), ...ids('ALTERNATIVE_FLOWS'), ...ids('VALIDATIONS')],
  });

  const proposedCriteria = [
    `Dado que elegí sucursal, fecha y un horario disponible, cuando confirmo la reserva, entonces el turno queda registrado y veo el comprobante con fecha, hora y sucursal.`,
    `Dado que ya tengo 2 turnos activos, cuando intento reservar otro, entonces el sistema no lo permite y me indica que primero debo cancelar uno.`,
    `Dado que el horario fue tomado por otra persona, cuando confirmo, entonces veo "Ese horario ya no está disponible. Elegí otro." y la lista de horarios se actualiza.`,
    `Dado que el sistema de agenda no responde, cuando confirmo, entonces veo "No pudimos confirmar tu turno. Probá de nuevo en unos minutos." y no se registra una reserva parcial.`,
    `Dado un uso normal, cuando confirmo una reserva, entonces la respuesta llega en menos de 2 segundos (p95). Supuesto a confirmar con negocio.`,
  ];
  changes.push({
    field: 'acceptanceCriteria',
    original: criteriaOf(story.description).join('\n'),
    proposed: proposedCriteria.join('\n'),
    justification: 'Reemplaza criterios ambiguos ("rápido", "mensaje adecuado", "etc.") por criterios verificables en formato Dado/Cuando/Entonces.',
    problemIds: [...ids('ACCEPTANCE_CRITERIA'), ...ids('AMBIGUITY')],
  });
  return { changes };
}
