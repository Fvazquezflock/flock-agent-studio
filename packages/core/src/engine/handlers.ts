import type { Cancellation, CapabilityGap, StepHandler as StepHandlerName, StoryProposal, TaskProposal, TaskType } from '@mao/shared';
import type { ApprovalItem } from '@mao/db';
import { issueVersionHash } from '../jira/issue-hash';
import type { JiraIssue, JiraIssueRef } from '../jira/types';
import type { PublicationResult } from '../publication/publication-service';
import type { ItemAction, ItemRationale } from '../approvals/approval-service';
import { PlatformError } from '../util/errors';
import { buildEpicPublicationItems, buildStoryPublicationItems, improvedStory, type StoryReviewLike } from './builders';
import type { StepContext, StepHandler, StepOutcome } from './step-context';

// ---------- jira.context ----------

export interface ContextOutput {
  mode: 'epic' | 'story';
  root: JiraIssue;
  parent?: JiraIssue;
  children: JiraIssue[];
  existingTasks: JiraIssueRef[];
  issueTypes: { id: string; name: string; subtask?: boolean }[];
  linkTypes: { name: string; inward: string; outward: string }[];
  baseHash: string;
  warnings: string[];
  summary?: unknown;
  gatewayMode: 'DEMO' | 'LIVE';
}

const sameType = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const jiraContext: StepHandler = {
  async run(ctx) {
    const mode = ctx.def.params.mode as 'epic' | 'story';
    const key = mode === 'epic' ? ctx.input.epicKey : ctx.input.storyKey;
    if (!key) throw new PlatformError('VALIDATION_ERROR', `Falta la clave de ${mode === 'epic' ? 'épica' : 'historia'} en la entrada`);
    const gw = ctx.gateway();
    const prisma = ctx.core.deps.prisma;
    await ctx.emit('JIRA_READ', `Leyendo ${key} (${gw.mode === 'DEMO' ? 'datos demo' : 'Jira real, solo lectura'})`);
    const root = await gw.getIssue(key);
    const expected = mode === 'epic' ? ctx.config.jira.issueTypes.epic : ctx.config.jira.issueTypes.story;
    if (!sameType(root.issueType, expected)) {
      throw new PlatformError('VALIDATION_ERROR', `${key} es de tipo "${root.issueType}" y el flujo espera "${expected}". Revisá la clave o el mapeo de tipos del proyecto.`);
    }
    const warnings: string[] = [];
    const children = await gw.getChildren(key).catch((e) => {
      warnings.push(`No se pudieron leer los hijos de ${key}: ${(e as Error).message}`);
      return [] as JiraIssue[];
    });
    let parent: JiraIssue | undefined;
    if (root.parentKey) parent = await gw.getIssue(root.parentKey).catch(() => undefined);
    const [issueTypes, linkTypes] = await Promise.all([
      gw.getIssueTypes(ctx.execution.project.jiraProjectKey).catch(() => []),
      gw.getLinkTypes().catch(() => []),
    ]);
    const typeNames = issueTypes.map((t) => t.name);
    for (const [role, name] of Object.entries(ctx.config.jira.issueTypes)) {
      if (typeNames.length && !typeNames.some((t) => sameType(t, name))) warnings.push(`El tipo configurado para "${role}" ("${name}") no existe en el proyecto Jira (${typeNames.join(', ')}).`);
    }
    const existingTasks: JiraIssueRef[] =
      mode === 'story'
        ? [...root.subtasks, ...children.map((c) => ({ key: c.key, summary: c.summary, issueType: c.issueType, status: c.status }))].filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i)
        : children.flatMap((c) => c.subtasks);

    for (const [role, issue] of [['root', root], ...(parent ? [['parent', parent]] : []), ...children.map((c) => ['child', c])] as [string, JiraIssue][]) {
      await prisma.issueSnapshot.upsert({
        where: { executionId_issueKey: { executionId: ctx.execution.id, issueKey: issue.key } },
        create: { executionId: ctx.execution.id, issueKey: issue.key, source: gw.mode, role, updated: issue.updated ?? null, contentHash: issueVersionHash(issue), data: issue as object },
        update: { updated: issue.updated ?? null, contentHash: issueVersionHash(issue), data: issue as object, fetchedAt: new Date() },
      });
    }
    const output: ContextOutput = { mode, root, parent, children, existingTasks, issueTypes, linkTypes, baseHash: issueVersionHash(root), warnings, gatewayMode: gw.mode };
    if (ctx.def.agentKey) {
      output.summary = await ctx.runAgent(ctx.def.agentKey, 'summarize_context', {
        mode,
        root,
        children: mode === 'epic' ? children : [],
        related: [...(parent ? [parent] : []), ...(mode === 'story' ? children : [])],
        projectKey: ctx.execution.project.jiraProjectKey,
      });
      const s = output.summary as { untrustedContentWarnings?: string[] };
      for (const w of s.untrustedContentWarnings ?? []) await ctx.emit('UNTRUSTED_CONTENT', w, { level: 'warn' });
    }
    for (const w of warnings) await ctx.emit('CONTEXT_WARNING', w, { level: 'warn' });
    return { status: 'COMPLETED', output, summary: `${root.key} leída con ${children.length} hija(s)` };
  },
};

// ---------- agent.task ----------

function allTasks(ctx: StepContext): TaskProposal[] {
  const fromBreakdowns = ctx.findOutputs<{ tasks: TaskProposal[] }>({ task: 'technical_breakdown' }).flatMap((o) => o.output.tasks);
  const qa = ctx.findOutput<{ qaTasks?: TaskProposal[] }>({ task: 'validate_plan' })?.qaTasks ?? ctx.findOutput<{ qaTasks?: TaskProposal[] }>({ task: 'qa_coverage' })?.qaTasks ?? [];
  // Refs únicas aunque distintos especialistas usen la misma numeración.
  const seen = new Set<string>();
  return [...fromBreakdowns, ...qa].map((t) => {
    let ref = t.ref;
    while (seen.has(ref)) ref = `${ref}'`;
    seen.add(ref);
    return ref === t.ref ? t : { ...t, ref };
  });
}

function epicRulesOf(c?: ContextOutput): string[] {
  const issue = c?.mode === 'epic' ? c.root : c?.parent;
  if (!issue) return [];
  const m = /##\s*Reglas[^\n]*\n([\s\S]*?)(\n##|$)/i.exec(issue.description);
  return m ? m[1].split('\n').map((l) => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean) : [];
}

export function buildTaskContext(ctx: StepContext, task: TaskType): Record<string, unknown> {
  const c = ctx.findOutput<ContextOutput>({ handler: 'jira.context' });
  const config = ctx.config;
  const feedback = (ctx.step.input as { feedback?: string } | null)?.feedback;
  const stories = ctx.findOutput<{ stories: StoryProposal[] }>({ task: 'generate_stories' })?.stories;
  const improvements = ctx.findOutput<{ changes: { field: string; proposed: string; original: string }[] }>({ task: 'story_improvements' });
  const storyForB = c?.mode === 'story' ? improvedStory(c.root, improvements?.changes ?? []) : undefined;
  const existingStories = c?.mode === 'epic' ? c.children.filter((x) => sameType(x.issueType, config.jira.issueTypes.story)) : [];
  switch (task) {
    case 'functional_analysis':
      return { epic: c?.root, existingStories, contextSummary: c?.summary, config, instructions: ctx.input.instructions };
    case 'generate_stories':
      return { epic: c?.root, existingStories, analysis: ctx.findOutput({ task: 'functional_analysis' }), config, instructions: ctx.input.instructions, feedback };
    case 'technical_breakdown':
      return {
        specialty: ctx.def.params.specialty,
        stories: c?.mode === 'story' ? [storyForB] : (stories ?? []),
        existingTasks: c?.existingTasks ?? [],
        epicRules: epicRulesOf(c),
        config,
        feedback,
      };
    case 'validate_plan':
      return {
        stories: stories ?? (storyForB ? [storyForB] : []),
        tasks: ctx.findOutputs<{ tasks: TaskProposal[] }>({ task: 'technical_breakdown' }).flatMap((o) => o.output.tasks),
        existingStories: existingStories.map((s) => ({ key: s.key, summary: s.summary })),
        existingTasks: c?.existingTasks ?? [],
        config,
      };
    case 'dependency_plan':
      return { stories: stories ?? [], tasks: allTasks(ctx), existingLinks: c?.root.links ?? [], config };
    case 'story_review':
      return { story: c?.root, parent: c?.parent, subtasks: c?.existingTasks ?? [], config, objective: ctx.input.objective };
    case 'story_improvements':
      return { story: c?.root, parent: c?.parent, review: ctx.findOutput({ task: 'story_review' }), objective: ctx.input.objective, config, feedback };
    case 'qa_coverage':
      return {
        story: storyForB,
        criteria: storyForB?.acceptanceCriteria ?? [],
        tasks: ctx.findOutputs<{ tasks: TaskProposal[] }>({ task: 'technical_breakdown' }).flatMap((o) => o.output.tasks),
        existingTasks: c?.existingTasks ?? [],
        config,
      };
    default:
      return { input: ctx.input, outputs: ctx.outputs, config };
  }
}

const agentTask: StepHandler = {
  async run(ctx) {
    const task = ctx.def.task as TaskType;
    const output = await ctx.runAgent(ctx.def.agentKey!, task, buildTaskContext(ctx, task));
    return { status: 'COMPLETED', output };
  },
};

// ---------- approval.gate ----------

const approvalGate: StepHandler = {
  async run(ctx): Promise<StepOutcome> {
    const prisma = ctx.core.deps.prisma;
    const prev = ctx.step.output as { approvalRequestId?: string } | null;
    if (prev?.approvalRequestId) {
      const req = await prisma.approvalRequest.findUnique({ where: { id: prev.approvalRequestId }, include: { items: true } });
      if (req && req.status === 'DECIDED') return { status: 'COMPLETED', output: { ...prev, number: req.number, counts: countItems(req.items) }, summary: `AP-${req.number} resuelta` };
      if (req && (req.status === 'PENDING' || req.status === 'PARTIALLY_DECIDED')) return { status: 'WAITING_APPROVAL', output: prev };
    }
    const c = ctx.findOutput<ContextOutput>({ handler: 'jira.context' });
    if (!c) throw new PlatformError('VALIDATION_ERROR', 'La aprobación requiere una etapa de contexto Jira previa');
    const builder = ctx.def.params.builder as string;
    const deps = ctx.findOutput<{ dependencies: { from: string; to: string; type: 'blocks' | 'relates'; reason: string }[] }>({ task: 'dependency_plan' })?.dependencies ?? [];
    const projectKey = ctx.execution.project.jiraProjectKey;
    const items =
      builder === 'epic_publication'
        ? buildEpicPublicationItems({
            projectKey,
            epicKey: c.root.key,
            stories: ctx.findOutput<{ stories: StoryProposal[] }>({ task: 'generate_stories' })?.stories ?? [],
            tasks: allTasks(ctx),
            dependencies: [...deps],
            config: ctx.config,
            children: c.children,
            obsolete: ctx.findOutput<{ obsoleteItems?: (Cancellation & { key: string })[] }>({ task: 'functional_analysis' })?.obsoleteItems ?? [],
          })
        : buildStoryPublicationItems({
            story: c.root,
            baseHash: c.baseHash,
            changes: ctx.findOutput<{ changes: any[] }>({ task: 'story_improvements' })?.changes ?? [],
            tasks: allTasks(ctx),
            dependencies: [...deps],
            config: ctx.config,
            projectKey,
            review: ctx.findOutput<StoryReviewLike>({ task: 'story_review' }),
          });

    // Tipos de issue: deben existir en el proyecto Jira (no se inventan esquemas).
    const available = c.issueTypes.map((t) => t.name);
    if (available.length) {
      const missing = [...new Set(items.filter((i) => i.operationType === 'CREATE_ISSUE').map((i) => String(i.payload.issueType)))].filter((t) => !available.some((a) => sameType(a, t)));
      if (missing.length) throw new PlatformError('VALIDATION_ERROR', `Tipos de issue inexistentes en ${projectKey}: ${missing.join(', ')}. Disponibles: ${available.join(', ')}. Ajustá el mapeo en la configuración del proyecto.`);
    }
    if (!items.length) return { status: 'COMPLETED', output: { approvalRequestId: null, note: 'No hay operaciones para publicar' }, summary: 'Nada para aprobar' };

    const req = await ctx.core.approvals.createExecutionRequest({
      executionId: ctx.execution.id,
      projectId: ctx.execution.projectId,
      orchestratorKey: ctx.snapshot.orchestrator.key,
      stepKey: ctx.step.key,
      kind: builder,
      title: builder === 'epic_publication' ? `Publicar historias y tareas de ${c.root.key}` : `Actualizar ${c.root.key} y crear tareas`,
      summary: `${items.length} operación(es) propuestas${c.gatewayMode === 'DEMO' ? ' (modo demo: la publicación será simulada)' : ''}`,
      items,
    });
    const output = { approvalRequestId: req.id, number: req.number };
    if (req.status === 'DECIDED') return { status: 'COMPLETED', output: { ...output, counts: countItems(req.items) }, summary: 'Resuelta por política' };
    return { status: 'WAITING_APPROVAL', output, summary: `Esperando aprobación AP-${req.number}` };
  },
};

function countItems(items: ApprovalItem[]) {
  return items.reduce<Record<string, number>>((acc, i) => ((acc[i.status] = (acc[i.status] ?? 0) + 1), acc), {});
}

// ---------- jira.publish ----------

function topoItems(items: ApprovalItem[]): ApprovalItem[] {
  const byKey = new Map(items.map((i) => [i.itemKey, i]));
  const out: ApprovalItem[] = [];
  const seen = new Set<string>();
  const visit = (i: ApprovalItem) => {
    if (seen.has(i.itemKey)) return;
    seen.add(i.itemKey);
    for (const d of i.dependsOn) {
      const dep = byKey.get(d);
      if (dep) visit(dep);
    }
    out.push(i);
  };
  // Las cancelaciones van al final: si la misma HU también se actualiza, primero se registran los cambios.
  [...items.filter((i) => i.operationType !== 'TRANSITION_ISSUE'), ...items.filter((i) => i.operationType === 'TRANSITION_ISSUE')].forEach(visit);
  return out;
}

const jiraPublish: StepHandler = {
  async run(ctx): Promise<StepOutcome> {
    const prisma = ctx.core.deps.prisma;
    const requests = await prisma.approvalRequest.findMany({
      where: { executionId: ctx.execution.id, status: { notIn: ['SUPERSEDED', 'CANCELLED'] } },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });
    if (requests.some((r) => r.kind === 'conflict_review' && (r.status === 'PENDING' || r.status === 'PARTIALLY_DECIDED'))) {
      return { status: 'WAITING_APPROVAL', output: ctx.step.output ?? {}, summary: 'Esperando revisión del conflicto' };
    }
    // Último estado por itemKey (una revisión por conflicto reemplaza al ítem original).
    const latest = new Map<string, ApprovalItem>();
    for (const r of requests) for (const i of r.items) latest.set(i.itemKey, i);
    const all = [...latest.values()];
    const gw = ctx.gateway();
    const conn = ctx.execution.project.connection;
    const pubCtx = {
      executionId: ctx.execution.id,
      executionNumber: ctx.execution.number,
      projectId: ctx.execution.projectId,
      orchestratorKey: ctx.snapshot.orchestrator.key,
      correlationId: ctx.execution.id,
      config: ctx.config,
      gateway: gw,
      created: new Map<string, string>(),
      touched: new Set<string>(),
      writeEnabled: !!conn?.writeEnabled && ctx.core.deps.allowJiraWrites,
    };
    await ctx.emit('PUBLICATION_STARTED', gw.mode === 'DEMO' ? 'Publicación SIMULADA (modo demo): no se escribe en Jira' : 'Publicación en Jira con operaciones aprobadas', { level: gw.mode === 'DEMO' ? 'warn' : 'info' });

    const results: PublicationResult[] = [];
    const done = new Set<string>();
    for (const item of topoItems(all)) {
      if (!['APPROVED', 'AUTO_APPROVED'].includes(item.status)) {
        results.push({ itemKey: item.itemKey, title: item.title, operationType: item.operationType, status: 'SKIPPED', message: `No aprobado (${item.status})` });
        continue;
      }
      if (item.dependsOn.some((d) => !done.has(d))) {
        results.push({ itemKey: item.itemKey, title: item.title, operationType: item.operationType, status: 'SKIPPED', message: 'Depende de un ítem no publicado' });
        continue;
      }
      if (ctx.signal.aborted) throw new PlatformError('CANCELLED', 'Publicación cancelada');
      const r = await ctx.core.publication.publishItem(item, pubCtx);
      results.push(r);
      if (r.status === 'SUCCEEDED' || r.status === 'SIMULATED') done.add(item.itemKey);
      await ctx.emit(
        r.status === 'SIMULATED' ? 'OPERATION_SIMULATED' : r.status === 'SUCCEEDED' ? 'OPERATION_EXECUTED' : 'OPERATION_NOT_EXECUTED',
        `${r.status === 'SIMULATED' ? 'Simulado' : r.status === 'SUCCEEDED' ? 'Ejecutado' : r.status}: ${item.title}${r.key ? ` → ${r.key}` : ''}${r.message && r.status !== 'SUCCEEDED' ? ` (${r.message})` : ''}`,
        { level: r.status === 'FAILED' || r.status === 'BLOCKED' ? 'error' : r.status === 'CONFLICT' ? 'warn' : 'success', data: r },
      );
    }

    const conflicts = results.filter((r) => r.status === 'CONFLICT');
    if (conflicts.length) {
      const items = conflicts.map((r) => {
        const orig = latest.get(r.itemKey)!;
        const p = orig.payload as Record<string, unknown>;
        const cur = r.conflict!.current;
        // Conserva el tipo (actualizar o cancelar), la acción y el motivo del ítem original.
        const rationale = orig.rationale as ItemRationale | null;
        return {
          itemKey: r.itemKey,
          group: 'Revisión por conflicto',
          operationType: orig.operationType as 'UPDATE_ISSUE' | 'TRANSITION_ISSUE',
          action: (orig.action ?? undefined) as ItemAction | undefined,
          rationale: rationale ? { ...rationale, evidence: [...rationale.evidence, `La issue cambió en Jira el ${cur.updated}: revisá contra la versión actual`] } : undefined,
          title: `Revisar de nuevo: ${orig.title}`,
          payload: { ...p, baseUpdated: cur.updated, baseHash: issueVersionHash(cur) },
          original: { summary: cur.summary, description: cur.description, status: cur.status },
        };
      });
      for (const r of conflicts) await prisma.approvalItem.update({ where: { id: latest.get(r.itemKey)!.id }, data: { status: 'CONFLICT', note: 'La issue cambió en Jira: se pidió una nueva revisión' } });
      const req = await ctx.core.approvals.createExecutionRequest({
        executionId: ctx.execution.id,
        projectId: ctx.execution.projectId,
        orchestratorKey: ctx.snapshot.orchestrator.key,
        stepKey: ctx.step.key,
        kind: 'conflict_review',
        title: `Conflicto de versión: revisá los cambios contra la versión actual`,
        summary: `${conflicts.length} issue(s) cambiaron en Jira durante la ejecución`,
        items,
      });
      return { status: 'WAITING_APPROVAL', output: { mode: gw.mode, results, conflictRequestId: req.id }, summary: `Conflicto: nueva revisión AP-${req.number}` };
    }
    const count = (s: string) => results.filter((r) => r.status === s).length;
    const output = {
      mode: gw.mode,
      results,
      succeeded: count('SUCCEEDED'),
      simulated: count('SIMULATED'),
      skipped: count('SKIPPED'),
      failed: count('FAILED'),
      blocked: count('BLOCKED'),
    };
    const summary =
      gw.mode === 'DEMO'
        ? `${output.simulated} operación(es) simuladas, ${output.skipped} omitidas (sin cambios en Jira)`
        : `${output.succeeded} ejecutadas en Jira, ${output.failed} fallidas, ${output.blocked} bloqueadas, ${output.skipped} omitidas`;
    return { status: 'COMPLETED', output, summary };
  },
};

// ---------- supervisor.review ----------

const supervisorReview: StepHandler = {
  async run(ctx) {
    const prisma = ctx.core.deps.prisma;
    const [agents, skills] = await Promise.all([
      prisma.agent.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
      prisma.skill.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
    ]);
    const outputs: Record<string, unknown> = {};
    for (const s of ctx.definition.steps) if (s.handler === 'agent.task' && ctx.outputs[s.key] !== undefined) outputs[s.key] = ctx.outputs[s.key];
    const review = (await ctx.runAgent(ctx.def.agentKey!, 'supervisor_review', {
      orchestratorKey: ctx.snapshot.orchestrator.key,
      outputs,
      technologies: ctx.config.technologies,
      catalog: {
        agents: agents.map((a) => ({ key: a.key, description: a.description, tags: (a.activeVersion?.definition as { tags?: string[] })?.tags ?? [] })),
        skills: skills.map((s) => {
          const d = s.activeVersion?.definition as { tags?: string[]; appliesTo?: { technologies?: string[] } } | undefined;
          return { key: s.key, description: s.description, tags: d?.tags ?? [], technologies: d?.appliesTo?.technologies ?? [] };
        }),
      },
    })) as { capabilityGaps: CapabilityGap[]; conflicts: unknown[]; qualityScore: number };
    const proposals: { id: string; number: number; targetKey: string; created: boolean }[] = [];
    // Delegación: si el supervisor puede delegar en CapabilityDesigner y está activo, él completa el diseño.
    const supervisorDef = ctx.snapshot.agents.find((a) => a.key === ctx.def.agentKey);
    const supervisorRow = supervisorDef ? await prisma.agentVersion.findUnique({ where: { id: supervisorDef.versionId } }) : null;
    const canDelegate = ((supervisorRow?.definition as { delegates?: string[] } | null)?.delegates ?? []).includes('CapabilityDesigner') && ctx.snapshot.agents.some((a) => a.key === 'CapabilityDesigner');
    for (const raw of review.capabilityGaps) {
      const gap = canDelegate ? ((await ctx.runAgent('CapabilityDesigner', 'design_capability', { gap: raw, technologies: ctx.config.technologies })) as CapabilityGap) : raw;
      const p = await ctx.core.proposals.createFromGap(gap, ctx.execution.id);
      proposals.push(p);
      if (p.created) await ctx.emit('PROPOSAL_CREATED', `Capacidad faltante detectada: propuesta CP-${p.number} (${gap.kind} ${gap.targetKey}) en borrador`, { level: 'warn', data: p });
    }
    for (const c of review.conflicts as { description: string }[]) await ctx.emit('CONFLICT_DETECTED', c.description, { level: 'warn' });
    return { status: 'COMPLETED', output: { ...review, proposals }, summary: `Calidad ${review.qualityScore}/100` };
  },
};

export const HANDLERS: Record<StepHandlerName, StepHandler> = {
  'jira.context': jiraContext,
  'agent.task': agentTask,
  'approval.gate': approvalGate,
  'jira.publish': jiraPublish,
  'supervisor.review': supervisorReview,
};
