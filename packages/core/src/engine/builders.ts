import type { Cancellation, ProjectConfig, StoryProposal, TaskProposal } from '@mao/shared';
import type { ItemDraft, ItemRationale } from '../approvals/approval-service';
import type { JiraIssue } from '../jira/types';
import type { StoryLike } from '../providers/mock/tech';

const bullets = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '- —');

/** Descripción de historia según la plantilla configurada en el proyecto. */
export function renderStoryDescription(s: StoryProposal, config: ProjectConfig): string {
  const ac =
    config.templates.acceptanceCriteriaFormat === 'checklist' ? s.acceptanceCriteria.map((c) => `- [ ] ${c}`).join('\n') : bullets(s.acceptanceCriteria);
  const values: Record<string, string> = {
    objective: s.objective,
    expectedBehavior: s.expectedBehavior,
    acceptanceCriteria: ac,
    businessRules: bullets(s.businessRules),
    assumptions: bullets([...s.assumptions, ...s.questions.map((q) => `Pregunta: ${q}`)]),
    actor: s.actor ?? '',
    description: s.description,
  };
  const body = config.templates.storyDescription.replace(/\{\{(\w+)\}\}/g, (_, k: string) => values[k] ?? '');
  return `${s.description}\n\n${body}\n\n_Relación con la épica: ${s.epicRelation}_`;
}

export function renderTaskDescription(t: TaskProposal): string {
  return [
    `## Objetivo\n${t.objective}`,
    `## Alcance\n${t.scope}`,
    `## Actividades\n${bullets(t.activities)}`,
    `## Criterios de finalización\n${bullets(t.doneCriteria)}`,
    t.risks.length ? `## Riesgos\n${bullets(t.risks)}` : '',
    `_Especialidad: ${t.specialty}_`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

interface DepEdge {
  from: string;
  to: string;
  type: 'blocks' | 'relates';
  reason: string;
}

const CANCEL_REASON: Record<Cancellation['reason'], string> = { DUPLICATE: 'Duplicada', OUT_OF_SCOPE: 'Fuera del alcance de la épica', OBSOLETE: 'Obsoleta' };

function storyRationale(s: StoryProposal): ItemRationale {
  return { reason: s.rationale || `Cubre lo que pide la épica y ninguna historia existente cubre: ${s.epicRelation}`, evidence: s.evidence };
}

function taskRationale(t: TaskProposal, storyLabel: string): ItemRationale {
  return { reason: t.rationale || `Necesaria para implementar ${storyLabel} (${t.specialty}): ${t.objective}`, evidence: t.evidence };
}

/**
 * Cancelar una historia existente: transición de estado en Jira (la transición se descubre con el conector y se
 * mapea en el proyecto; sin mapear, la publicación real se bloquea con un aviso). Siempre aprobación individual.
 */
export function buildCancelItem(issue: { key: string; summary: string; updated?: string }, c: Cancellation, config: ProjectConfig, baseHash?: string): ItemDraft {
  const t = config.jira.cancelTransition;
  const label = CANCEL_REASON[c.reason];
  return {
    itemKey: `cancel:${issue.key}`,
    group: 'Historias a cancelar',
    operationType: 'TRANSITION_ISSUE',
    action: 'CANCEL',
    title: `Cancelar ${issue.key}: ${issue.summary}`,
    payload: {
      issueKey: issue.key,
      transitionId: t?.id ?? null,
      transitionName: t?.name ?? null,
      comment: `Cancelada desde Multi-Agent Orchestration Studio. Motivo: ${label}${c.duplicateOf ? ` (duplica ${c.duplicateOf})` : ''}. ${c.explanation}`,
      reason: c.reason,
      ...(c.duplicateOf ? { duplicateOf: c.duplicateOf } : {}),
      ...(issue.updated ? { baseUpdated: issue.updated } : {}),
      ...(baseHash ? { baseHash } : {}),
    },
    rationale: { reason: `${label}${c.duplicateOf ? ` de ${c.duplicateOf}` : ''}: ${c.explanation}`, evidence: c.evidence },
  };
}

/** Salida de la validación de la HU que usan los constructores (problemas, diagnóstico y cancelación). */
export interface StoryReviewLike {
  diagnosis?: { summary: string; readiness: string; score: number };
  problems?: { id: string; area: string; severity: string; description: string; evidence?: string }[];
  cancellation?: Cancellation | null;
}

function taskIssueType(config: ProjectConfig): string {
  return config.jira.taskHierarchy === 'subtask' ? config.jira.issueTypes.subtask : config.jira.issueTypes.task;
}

/** Ítems a aprobar para el flujo Épica → HU → Tareas. */
export function buildEpicPublicationItems(args: {
  projectKey: string;
  epicKey: string;
  stories: StoryProposal[];
  tasks: TaskProposal[];
  dependencies: DepEdge[];
  config: ProjectConfig;
  /** Historias existentes de la épica (para cancelar las que sobran con su versión leída). */
  children?: JiraIssue[];
  obsolete?: (Cancellation & { key: string })[];
}): ItemDraft[] {
  const { config } = args;
  const items: ItemDraft[] = [];
  const refToItem = new Map<string, string>();
  const storyTitle = new Map(args.stories.map((s) => [s.ref, s.title]));
  for (const s of args.stories) {
    const key = `story:${s.ref}`;
    refToItem.set(s.ref, key);
    items.push({
      itemKey: key,
      group: 'Historias',
      operationType: 'CREATE_ISSUE',
      action: 'CREATE',
      rationale: storyRationale(s),
      title: s.title,
      payload: {
        projectKey: args.projectKey,
        issueType: config.jira.issueTypes.story,
        summary: s.title,
        description: renderStoryDescription(s, config),
        parentKey: args.epicKey,
        meta: { ref: s.ref, kind: 'story', acceptanceCriteria: s.acceptanceCriteria, questions: s.questions },
      },
    });
  }
  const dupMap = new Map<string, string>();
  for (const t of args.tasks) {
    if (t.duplicateOf) {
      dupMap.set(t.ref, t.duplicateOf);
      continue;
    }
    const key = `task:${t.ref}`;
    refToItem.set(t.ref, key);
    const parentItem = refToItem.get(t.storyRef);
    const hierarchy = config.jira.taskHierarchy;
    items.push({
      itemKey: key,
      group: 'Tareas técnicas',
      operationType: 'CREATE_ISSUE',
      action: 'CREATE',
      rationale: taskRationale(t, storyTitle.has(t.storyRef) ? `"${storyTitle.get(t.storyRef)}"` : t.storyRef),
      title: t.title,
      payload: {
        projectKey: args.projectKey,
        issueType: taskIssueType(config),
        summary: t.title,
        description: renderTaskDescription(t),
        ...(hierarchy !== 'link' ? (parentItem ? { parentRef: parentItem } : { parentKey: t.storyRef }) : {}),
        meta: { ref: t.ref, kind: 'task', specialty: t.specialty, storyRef: t.storyRef },
      },
      dependsOn: parentItem && hierarchy !== 'link' ? [parentItem] : [],
    });
    if (hierarchy === 'link') {
      args.dependencies.push({ from: t.storyRef, to: t.ref, type: 'relates', reason: 'Tarea de la historia' });
    }
  }
  items.push(...buildLinkItems(args.dependencies, refToItem, dupMap, config));
  // Solo se cancelan historias que de verdad son hijas de la épica (no se aceptan claves inventadas por el modelo).
  for (const o of args.obsolete ?? []) {
    const child = args.children?.find((c) => c.key === o.key);
    if (child) items.push(buildCancelItem(child, o, config));
  }
  return items;
}

/** Ítems de vínculo: cada extremo es un ítem nuevo (ref) o una issue existente (clave). */
export function buildLinkItems(deps: DepEdge[], refToItem: Map<string, string>, dupMap: Map<string, string>, config: ProjectConfig): ItemDraft[] {
  const items: ItemDraft[] = [];
  const seen = new Set<string>();
  const isKey = (x: string) => /^[A-Z][A-Z0-9_]+-\d+$/.test(x);
  for (const d of deps) {
    const from = dupMap.get(d.from) ?? d.from;
    const to = dupMap.get(d.to) ?? d.to;
    const fromItem = refToItem.get(from);
    const toItem = refToItem.get(to);
    if ((!fromItem && !isKey(from)) || (!toItem && !isKey(to)) || (!fromItem && !toItem)) continue;
    const key = `link:${from}->${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Convención: outward = issue que bloquea, inward = issue bloqueada.
    items.push({
      itemKey: key,
      group: 'Relaciones',
      operationType: 'CREATE_ISSUE_LINK',
      action: 'CREATE',
      rationale: { reason: d.reason || (d.type === 'blocks' ? 'Dependencia de orden entre las issues' : 'Issues relacionadas'), evidence: [] },
      title: `${from} ${d.type === 'blocks' ? 'bloquea a' : 'se relaciona con'} ${to}`,
      payload: {
        linkType: d.type === 'blocks' ? config.jira.linkTypes.blocks : config.jira.linkTypes.relates,
        ...(fromItem ? { outwardRef: fromItem } : { outwardKey: from }),
        ...(toItem ? { inwardRef: toItem } : { inwardKey: to }),
        reason: d.reason,
      },
      dependsOn: [fromItem, toItem].filter((x): x is string => !!x),
    });
  }
  return items;
}

export function improvedStory(root: JiraIssue, changes: { field: string; proposed: string }[]): StoryLike & { description: string } {
  const get = (f: string) => changes.find((c) => c.field === f)?.proposed;
  const criteria = (get('acceptanceCriteria') ?? '').split(/\r?\n/).map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean);
  return {
    ref: root.key,
    title: get('summary') ?? root.summary,
    description: get('description') ?? root.description,
    acceptanceCriteria: criteria,
    businessRules: [],
  };
}

/** Ítems a aprobar para el flujo HU existente → validación → tareas. */
export function buildStoryPublicationItems(args: {
  story: JiraIssue;
  baseHash: string;
  changes: { field: string; original: string; proposed: string; justification: string }[];
  tasks: TaskProposal[];
  dependencies: DepEdge[];
  config: ProjectConfig;
  projectKey: string;
  review?: StoryReviewLike;
}): ItemDraft[] {
  const { story, config } = args;
  const items: ItemDraft[] = [];
  if (args.review?.cancellation) items.push(buildCancelItem(story, args.review.cancellation, config, args.baseHash));
  if (args.changes.length) {
    const get = (f: string) => args.changes.find((c) => c.field === f)?.proposed;
    const ac = get('acceptanceCriteria');
    const desc = get('description');
    const newDescription = desc || ac ? `${desc ?? story.description}${ac ? `\n\n## Criterios de aceptación\n${ac.split(/\r?\n/).map((l) => `- ${l.replace(/^[-*]\s*/, '')}`).join('\n')}` : ''}` : undefined;
    // Inconsistencias que resuelven los cambios (las que citan por id); si no citan ninguna, todas las encontradas.
    const cited = new Set(args.changes.flatMap((c) => (c as { problemIds?: string[] }).problemIds ?? []));
    const problems = (args.review?.problems ?? []).filter((p) => !cited.size || cited.has(p.id));
    const fieldLabel: Record<string, string> = { summary: 'Título', description: 'Descripción', acceptanceCriteria: 'Criterios de aceptación' };
    const d = args.review?.diagnosis;
    items.push({
      itemKey: 'story:update',
      group: 'Cambios en la HU',
      operationType: 'UPDATE_ISSUE',
      action: 'UPDATE',
      rationale: {
        reason: problems.length
          ? `La validación encontró ${problems.length} inconsistencia(s) en ${story.key}${d ? ` (${d.score}/100, ${d.readiness})` : ''}; los cambios las corrigen.`
          : `Mejoras propuestas para ${story.key}.`,
        evidence: args.changes.map((c) => `${fieldLabel[c.field] ?? c.field}: ${c.justification}`),
        inconsistencies: problems.map((p) => ({ id: p.id, severity: p.severity, description: p.description, evidence: p.evidence || undefined })),
      },
      title: `Actualizar ${story.key}`,
      payload: {
        issueKey: story.key,
        ...(get('summary') ? { summary: get('summary') } : {}),
        ...(newDescription ? { description: newDescription } : {}),
        baseUpdated: story.updated,
        baseHash: args.baseHash,
        meta: { justifications: args.changes.map((c) => ({ field: c.field, justification: c.justification })) },
      },
      original: { summary: story.summary, description: story.description },
    });
  }
  const refToItem = new Map<string, string>();
  const dupMap = new Map<string, string>();
  for (const t of args.tasks) {
    if (t.duplicateOf) {
      dupMap.set(t.ref, t.duplicateOf);
      continue;
    }
    const key = `task:${t.ref}`;
    refToItem.set(t.ref, key);
    items.push({
      itemKey: key,
      group: 'Tareas nuevas',
      operationType: 'CREATE_ISSUE',
      action: 'CREATE',
      rationale: taskRationale(t, story.key),
      title: t.title,
      payload: {
        projectKey: args.projectKey,
        issueType: taskIssueType(config),
        summary: t.title,
        description: renderTaskDescription(t),
        ...(config.jira.taskHierarchy !== 'link' ? { parentKey: story.key } : {}),
        meta: { ref: t.ref, kind: 'task', specialty: t.specialty, storyRef: story.key },
      },
    });
  }
  const deps = args.dependencies.filter((d) => d.from !== story.key && d.to !== story.key);
  items.push(...buildLinkItems(deps, refToItem, dupMap, config));
  return items;
}
