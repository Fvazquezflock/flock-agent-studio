import { GRANTABLE_TOOLS, type CapabilityGap } from '@mao/shared';
import type { ApprovalItem, Prisma } from '@mao/db';
import type { Core } from '../core';
import type { Actor } from '../context';
import type { ItemDraft } from '../approvals/approval-service';
import { safetyScan, validateDefinition, type CatalogKind } from '../catalog/validation';
import { contentHash } from '../util/hash';
import { diffJson } from '../util/diff';
import { PlatformError, notFound } from '../util/errors';
import { buildSystemPrompt } from '../agents/prompts';
import { agentDefinitionSchema, skillDefinitionSchema } from '@mao/shared';

const KIND_TO_CATALOG: Record<string, CatalogKind | undefined> = { AGENT: 'agent', SKILL: 'skill', ORCHESTRATOR: 'orchestrator' };
const VERSION_MODEL: Record<CatalogKind, string> = { agent: 'agentVersion', skill: 'skillVersion', orchestrator: 'orchestratorVersion' };
const KIND_LABEL: Record<CatalogKind, string> = { agent: 'el agente', skill: 'la skill', orchestrator: 'el orquestador' };
const ACTION_LABEL: Record<string, string> = { CREATE: 'crear', UPDATE: 'modificar', CANCEL: 'cancelar' };

function collectText(v: unknown, acc: string[] = []): string[] {
  if (typeof v === 'string') acc.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectText(x, acc));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectText(x, acc));
  return acc;
}

/**
 * Propuestas de capacidades (autoevolución supervisada): el supervisor detecta faltantes y crea borradores.
 * Nada se activa sin aprobación: aprobar crea una versión APROBADA (no activa) y activar pide otra aprobación.
 * Una propuesta nunca puede introducir código ejecutable, dependencias, comandos ni permisos elevados.
 */
export class ProposalService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  list(status?: string) {
    return this.prisma.capabilityProposal.findMany({
      where: status ? { status: status as Prisma.EnumProposalStatusFilter['equals'] } : {},
      orderBy: { createdAt: 'desc' },
      include: { sourceExecution: { select: { number: true } } },
    });
  }

  async get(id: string) {
    const p = await this.prisma.capabilityProposal.findFirst({
      where: /^\d+$/.test(id) ? { number: Number(id) } : { id },
      include: { revisions: { orderBy: { revision: 'asc' } }, sourceExecution: { select: { id: true, number: true } } },
    });
    if (!p) throw notFound(`Propuesta ${id}`);
    return p;
  }

  /** Verificación determinística (no depende del modelo). */
  async verify(kind: string, definition: unknown, tools: string[], permissions: string[], action = 'CREATE', targetKey?: string) {
    const catalogKind = KIND_TO_CATALOG[kind];
    const errors: string[] = [];
    const warnings: string[] = [];
    if (catalogKind && targetKey && action !== 'CREATE') {
      const exists = (await (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ status: string } | null> }>)[catalogKind].findUnique({ where: { key: targetKey } })) as { status: string } | null;
      if (!exists) errors.push(`${targetKey} no existe en el catálogo: no se puede ${action === 'CANCEL' ? 'cancelar' : 'modificar'}.`);
      if (action === 'CANCEL') {
        if (catalogKind === 'agent' && targetKey === 'MainSupervisor') errors.push('El supervisor principal no puede cancelarse.');
        if (exists && exists.status !== 'ACTIVE') warnings.push(`${targetKey} ya no está activo.`);
        return { checkedAt: new Date().toISOString(), passed: errors.length === 0, errors, warnings };
      }
    }
    if (!catalogKind) errors.push('Las propuestas de modificación se aplican como nueva versión de un agente, skill u orquestador existente.');
    else {
      const res = validateDefinition(catalogKind, definition, await this.core.catalog.index());
      errors.push(...res.errors);
      warnings.push(...res.warnings.filter((w) => !w.startsWith('Revisión de seguridad')));
    }
    const notGrantable = tools.filter((t) => !(GRANTABLE_TOOLS as readonly string[]).includes(t));
    if (notGrantable.length) errors.push(`Herramientas no otorgables (solo lectura controlada): ${notGrantable.join(', ')}`);
    if (permissions.length) errors.push(`Las propuestas no pueden pedir permisos adicionales: ${permissions.join(', ')}`);
    const safety = safetyScan(collectText(definition).join('\n'));
    for (const s of safety) errors.push(`Contenido no permitido en una propuesta: ${s}`);
    return { checkedAt: new Date().toISOString(), passed: errors.length === 0, errors, warnings };
  }

  async createFromGap(gap: CapabilityGap, executionId: string): Promise<{ id: string; number: number; targetKey: string; created: boolean }> {
    const open = await this.prisma.capabilityProposal.findFirst({ where: { targetKey: gap.targetKey, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] } } });
    if (open) return { id: open.id, number: open.number, targetKey: open.targetKey, created: false };
    const catalogKind = KIND_TO_CATALOG[gap.kind];
    // Crear algo que ya existe no tiene sentido (se ignora); modificar o cancelar exige que exista (lo comprueba la verificación).
    if (catalogKind && gap.action === 'CREATE') {
      const exists = await (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[catalogKind].findUnique({ where: { key: gap.targetKey } });
      if (exists) return { id: '', number: 0, targetKey: gap.targetKey, created: false };
    }
    const verification = await this.verify(gap.kind, gap.definition, gap.tools, gap.permissions, gap.action, gap.targetKey);
    const p = await this.prisma.capabilityProposal.create({
      data: {
        kind: gap.kind,
        action: gap.action,
        evidence: gap.evidence,
        targetKey: gap.targetKey,
        title: gap.title,
        problem: gap.problem,
        justification: gap.justification,
        solution: gap.solution,
        definition: gap.definition as object,
        toolsRequested: gap.tools,
        permissionsRequested: gap.permissions,
        expectedImpact: gap.impact,
        risks: gap.risks,
        suggestedTests: gap.tests,
        verification,
        createdByType: 'AGENT',
        createdBy: 'MainSupervisor',
        sourceExecutionId: executionId,
        revisions: { create: { revision: 1, snapshot: gap as object, editedBy: 'MainSupervisor' } },
      },
    });
    await this.core.audit.record({
      actor: { type: 'AGENT', id: 'MainSupervisor' },
      action: 'PROPOSAL_CREATED',
      entityType: 'CapabilityProposal',
      entityId: p.id,
      executionId,
      summary: `CP-${p.number}: ${ACTION_LABEL[gap.action]} ${gap.kind} ${gap.targetKey} — ${gap.title} (borrador${verification.passed ? '' : ', con observaciones de verificación'})`,
    });
    return { id: p.id, number: p.number, targetKey: p.targetKey, created: true };
  }

  async edit(id: string, patch: Record<string, unknown>, actor: Actor) {
    const p = await this.get(id);
    if (p.status !== 'DRAFT') throw new PlatformError('VERSION_CONFLICT', `Solo se editan propuestas en borrador (está ${p.status})`);
    const next = {
      title: (patch.title as string) ?? p.title,
      problem: (patch.problem as string) ?? p.problem,
      justification: (patch.justification as string) ?? p.justification,
      solution: (patch.solution as string) ?? p.solution,
      definition: (patch.definition as object) ?? (p.definition as object),
      expectedImpact: (patch.expectedImpact as string) ?? p.expectedImpact,
      risks: (patch.risks as string[]) ?? p.risks,
      suggestedTests: (patch.suggestedTests as string[]) ?? p.suggestedTests,
    };
    const verification = await this.verify(p.kind, next.definition, p.toolsRequested, p.permissionsRequested, p.action, p.targetKey);
    const revision = p.revision + 1;
    const updated = await this.prisma.capabilityProposal.update({
      where: { id: p.id },
      data: { ...next, revision, verification, revisions: { create: { revision, snapshot: next as object, editedBy: actor.id } } },
    });
    await this.core.audit.record({ actor, action: 'PROPOSAL_EDITED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number} revisión ${revision}` });
    return updated;
  }

  async diff(id: string, from: number, to: number) {
    const p = await this.get(id);
    const a = p.revisions.find((r) => r.revision === from);
    const b = p.revisions.find((r) => r.revision === to);
    if (!a || !b) throw notFound('Revisión');
    return diffJson((a.snapshot as { definition?: unknown }).definition ?? a.snapshot, (b.snapshot as { definition?: unknown }).definition ?? b.snapshot);
  }

  /** Prueba sin efectos: verificación + vista previa del prompt resultante. */
  async test(id: string) {
    const p = await this.get(id);
    const verification = await this.verify(p.kind, p.definition, p.toolsRequested, p.permissionsRequested, p.action, p.targetKey);
    let preview = '';
    if (p.kind === 'SKILL') {
      const skill = skillDefinitionSchema.safeParse(p.definition);
      const host = await this.prisma.agent.findUnique({ where: { key: 'BackendSpecialist' }, include: { activeVersion: true } });
      const agent = host?.activeVersion ? agentDefinitionSchema.safeParse(host.activeVersion.definition) : null;
      if (skill.success && agent?.success) preview = buildSystemPrompt(agent.data, [{ key: p.targetKey, def: skill.data }]);
    } else if (p.kind === 'AGENT') {
      const agent = agentDefinitionSchema.safeParse(p.definition);
      if (agent.success) preview = buildSystemPrompt(agent.data, []);
    }
    return { verification, promptPreview: preview };
  }

  // ---------- Plan de implementación ----------

  /**
   * Plan de implementación según el estado: crear la versión en el catálogo, activarla y (para skills) agregarla
   * a las skills del proyecto donde se detectó la necesidad. Lo calcula el backend a partir de datos verificados;
   * el modelo no decide destinos. El hash cambia si cambia cualquier paso (contenido, revisión o destino).
   */
  async planFor(p: Awaited<ReturnType<ProposalService['get']>>) {
    const kind = KIND_TO_CATALOG[p.kind];
    const notes: string[] = [];
    const steps: ItemDraft[] = [];
    let project: { id: string; key: string; name: string } | null = null;
    let affectedAgents: string[] = [];
    if (p.sourceExecutionId) {
      const ex = await this.prisma.execution.findUnique({ where: { id: p.sourceExecutionId }, select: { project: { select: { id: true, key: true, name: true } } } });
      project = ex?.project ?? null;
    }
    if (!kind) return { steps, hash: contentHash([]), project, affectedAgents, notes: ['Las modificaciones se aplican como nueva versión desde el catálogo.'] };
    const applied = p.appliedVersionRef as { kind: CatalogKind; key: string; version: number; versionId: string; activated?: boolean; assignedTo?: string | null } | null;
    const activationOp = ({ skill: 'ACTIVATE_SKILL', agent: 'ACTIVATE_AGENT', orchestrator: 'ACTIVATE_ORCHESTRATOR' } as const)[kind];

    if (p.action === 'CANCEL' && (p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL')) {
      if (kind === 'skill' && project) {
        const { config } = await this.core.config.resolvedForProject(project.id);
        if (config.projectSkills.includes(p.targetKey)) {
          steps.push({ itemKey: 'unassign', group: 'Asignación', operationType: 'MODIFY_AGENT_CONFIG', title: `Quitar ${p.targetKey} de las skills del proyecto ${project.key}`, payload: { projectKey: project.key, skillKey: p.targetKey, remove: true } });
        }
      }
      steps.push({ itemKey: 'deactivate', group: 'Catálogo', operationType: activationOp, title: `Dejar de usar ${p.targetKey} (desactivarlo en el catálogo)`, payload: { kind, key: p.targetKey, deactivate: true, fromProposal: p.id } });
      notes.push('Desactivar afecta a todos los proyectos y agentes que la usen; las ejecuciones en curso conservan sus versiones fijadas.');
      const hash = contentHash(steps.map((s) => ({ itemKey: s.itemKey, operationType: s.operationType, payload: s.payload, dependsOn: s.dependsOn ?? [] })));
      return { steps, hash, project, affectedAgents, notes };
    }
    if (p.status === 'DRAFT' || p.status === 'PENDING_APPROVAL') {
      const exists = await (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[kind].findUnique({ where: { key: p.targetKey } });
      steps.push({
        itemKey: 'proposal',
        group: 'Catálogo',
        operationType: 'APPLY_CAPABILITY_PROPOSAL',
        title: exists ? `Crear una nueva versión de ${p.targetKey}` : `Crear ${KIND_LABEL[kind]} ${p.targetKey} en el catálogo`,
        payload: { proposalId: p.id, revision: p.revision, definitionHash: contentHash(p.definition), kind: p.kind, targetKey: p.targetKey, definition: p.definition },
      });
      steps.push({
        itemKey: 'activation',
        group: 'Activación',
        operationType: activationOp,
        title: `Activar ${p.targetKey}`,
        payload: { kind, key: p.targetKey, fromProposal: p.id, revision: p.revision, definitionHash: contentHash(p.definition) },
        dependsOn: ['proposal'],
      });
    } else if (p.status === 'APPROVED' && applied && !applied.activated) {
      // Aprobada con el flujo anterior (versión creada, sin activar): el plan completa los pasos que faltan.
      const versionModel = VERSION_MODEL[kind];
      const v = (await (this.prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ status: string; checksum: string } | null> }>)[versionModel].findUnique({ where: { id: applied.versionId } }))!;
      if (v && v.status !== 'ACTIVE') {
        steps.push({
          itemKey: 'activation',
          group: 'Activación',
          operationType: activationOp,
          title: `Activar ${p.targetKey} v${applied.version}`,
          payload: { kind, key: p.targetKey, versionId: applied.versionId, version: applied.version, checksum: v.checksum },
        });
      }
    }

    if (kind === 'skill' && steps.some((s) => s.itemKey === 'activation')) {
      if (!project) notes.push('La propuesta no viene de una ejecución: la skill queda activa sin asignar (asignala desde el proyecto o el agente).');
      else {
        const { config } = await this.core.config.resolvedForProject(project.id);
        const skill = skillDefinitionSchema.safeParse(p.definition);
        const tasks = skill.success ? skill.data.appliesTo.tasks : [];
        if (!skill.success) notes.push('La definición todavía no es válida: no se puede calcular qué agentes la van a usar.');
        else {
          affectedAgents = await this.agentsUsing(tasks, config.enabledAgents);
          if (!tasks.length) notes.push('La skill no limita tareas (appliesTo.tasks vacío): la reciben todos los agentes del proyecto en todas sus tareas, con más consumo de tokens.');
        }
        if (config.projectSkills.includes(p.targetKey)) notes.push(`${p.targetKey} ya está en las skills del proyecto ${project.key}.`);
        else
          steps.push({
            itemKey: 'assign',
            group: 'Asignación',
            operationType: 'MODIFY_AGENT_CONFIG',
            title: `Agregar ${p.targetKey} a las skills del proyecto ${project.key}`,
            payload: { projectKey: project.key, skillKey: p.targetKey, tasks, agents: affectedAgents },
            dependsOn: ['activation'],
          });
      }
    }
    const hash = contentHash(steps.map((s) => ({ itemKey: s.itemKey, operationType: s.operationType, payload: s.payload, dependsOn: s.dependsOn ?? [] })));
    return { steps, hash, project, affectedAgents, notes };
  }

  /** Agentes activos (o habilitados en el proyecto) que ejecutan alguna de las tareas: los que van a recibir la skill. */
  private async agentsUsing(tasks: string[], enabled: string[]) {
    const agents = await this.prisma.agent.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true }, orderBy: { key: 'asc' } });
    return agents
      .filter((a) => !enabled.length || enabled.includes(a.key))
      .filter((a) => {
        const def = agentDefinitionSchema.safeParse(a.activeVersion?.definition);
        return def.success && (!tasks.length || def.data.tasks.some((t) => tasks.includes(t)));
      })
      .map((a) => a.key);
  }

  private openRequest(proposalId: string) {
    return this.prisma.approvalRequest.findFirst({ where: { subjectType: 'CapabilityProposal', subjectId: proposalId, status: { in: ['PENDING', 'PARTIALLY_DECIDED'] } }, include: { items: true }, orderBy: { createdAt: 'desc' } });
  }

  /** Detalle para la UI/CLI: propuesta + plan de implementación + solicitudes de aprobación vinculadas. */
  async detail(id: string) {
    const p = await this.get(id);
    const plan = await this.planFor(p);
    const requests = await this.prisma.approvalRequest.findMany({
      where: { subjectType: 'CapabilityProposal', subjectId: p.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, number: true, status: true, createdAt: true, items: { select: { itemKey: true, title: true, status: true, operationType: true } } },
    });
    return {
      ...p,
      plan: { hash: plan.hash, project: plan.project, affectedAgents: plan.affectedAgents, notes: plan.notes, steps: plan.steps.map((s) => ({ itemKey: s.itemKey, group: s.group, operationType: s.operationType, title: s.title, dependsOn: s.dependsOn ?? [] })) },
      requests,
      openRequest: requests.find((r) => r.status === 'PENDING' || r.status === 'PARTIALLY_DECIDED') ?? null,
    };
  }

  private async createPlanRequest(p: Awaited<ReturnType<ProposalService['get']>>, plan: Awaited<ReturnType<ProposalService['planFor']>>, actor: Actor) {
    return this.core.approvals.createProposalPlanRequest(
      { id: p.id, number: p.number, revision: p.revision, kind: p.kind, targetKey: p.targetKey, title: p.title, projectId: plan.project?.id ?? null },
      plan.steps,
      actor,
    );
  }

  /** Envía el plan a aprobación (para revisarlo después desde Aprobaciones). */
  async submit(id: string, actor: Actor) {
    const p = await this.get(id);
    if (p.status !== 'DRAFT') throw new PlatformError('VERSION_CONFLICT', `La propuesta está ${p.status}`);
    const verification = await this.verify(p.kind, p.definition, p.toolsRequested, p.permissionsRequested, p.action, p.targetKey);
    await this.prisma.capabilityProposal.update({ where: { id: p.id }, data: { verification } });
    if (!verification.passed) throw new PlatformError('VALIDATION_ERROR', `La propuesta no pasa la verificación: ${verification.errors.join('; ')}`);
    const plan = await this.planFor(p);
    await this.prisma.capabilityProposal.update({ where: { id: p.id }, data: { status: 'PENDING_APPROVAL' } });
    return this.createPlanRequest({ ...p, status: 'PENDING_APPROVAL' }, plan, actor);
  }

  /**
   * "Confirmar e implementar": el usuario confirma el plan que está viendo (hash) y el backend registra su
   * aprobación individual de cada paso, en orden. Al decidirse el último, `applyDecidedPlan` aplica todo en
   * la misma transacción. No relaja ninguna política: cada ítem se aprueba de a uno, con su auditoría.
   */
  async implement(id: string, input: { confirmHash: string; comment?: string; channel: string }, actor: Actor) {
    const p = await this.get(id);
    const plan = await this.planFor(p);
    if (!plan.steps.length) throw new PlatformError('VERSION_CONFLICT', `No hay pasos pendientes para CP-${p.number} (está ${p.status})`);
    if (!input.confirmHash || !plan.hash.startsWith(input.confirmHash)) {
      throw new PlatformError('VERSION_CONFLICT', 'El plan cambió desde que lo revisaste: volvé a consultarlo antes de confirmar.');
    }
    let requestId: string;
    if (p.status === 'DRAFT') requestId = (await this.submit(p.id, actor)).id;
    else {
      const open = await this.openRequest(p.id);
      const same = open && open.items.map((i) => i.itemKey).sort().join(',') === plan.steps.map((s) => s.itemKey).sort().join(',');
      if (open && same) requestId = open.id;
      else {
        if (open) await this.core.approvals.supersede(open.id, `Reemplazada por el plan de implementación completo de CP-${p.number}`, input.channel, actor);
        requestId = (await this.createPlanRequest(p, plan, actor)).id;
      }
    }
    const comment = input.comment?.trim() || `Confirmado en el plan de implementación de CP-${p.number}`;
    for (const step of plan.steps) {
      const req = await this.core.approvals.get(requestId);
      const item = req.items.find((i) => i.itemKey === step.itemKey);
      if (!item || item.status !== 'PENDING') continue;
      await this.core.approvals.decide(requestId, { approve: [item.id], reject: [], comment, channel: input.channel, confirmHash: req.decisionHash.slice(0, 12) }, actor);
    }
    return this.detail(p.id);
  }

  /**
   * Regenera la definición con CapabilityDesigner a partir del problema y la solución (para borradores con la
   * definición vacía o inválida). Usa el proveedor de la ejecución de origen; el resultado es una nueva revisión.
   */
  async redesign(id: string, actor: Actor) {
    const p = await this.get(id);
    if (p.status !== 'DRAFT') throw new PlatformError('VERSION_CONFLICT', `Solo se regeneran propuestas en borrador (está ${p.status})`);
    const ex = p.sourceExecutionId ? await this.prisma.execution.findUnique({ where: { id: p.sourceExecutionId }, include: { provider: true } }) : null;
    const provider = ex?.provider ?? (await this.prisma.modelProviderConfiguration.findFirst({ where: { isDefault: true, enabled: true } }));
    if (!provider) throw new PlatformError('TOOL_UNAVAILABLE', 'No hay proveedor de IA disponible para regenerar el diseño');
    const technologies = ex ? (await this.core.config.resolvedForProject(ex.projectId)).config.technologies : [];
    const gap: CapabilityGap = {
      kind: p.kind,
      action: p.action as CapabilityGap['action'],
      evidence: p.evidence,
      targetKey: p.targetKey,
      title: p.title,
      problem: p.problem,
      justification: p.justification,
      solution: p.solution,
      definition: (p.definition as Record<string, unknown>) ?? {},
      tools: p.toolsRequested,
      permissions: p.permissionsRequested,
      impact: p.expectedImpact,
      risks: p.risks,
      tests: p.suggestedTests,
    };
    const r = await this.core.agents.run({
      agentKey: 'CapabilityDesigner',
      task: 'design_capability',
      context: { gap, technologies },
      executionProvider: provider,
      correlationId: `redesign:${p.id}:${Date.now()}`,
      trace: { origin: 'PROPOSAL_REDESIGN' },
    });
    // Solo se toma la definición: el tipo, la clave, las herramientas y los permisos no los cambia el modelo.
    const designed = r.output as CapabilityGap;
    const updated = await this.edit(p.id, { definition: designed.definition }, actor);
    await this.core.audit.record({ actor, action: 'PROPOSAL_REDESIGNED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number}: definición regenerada por CapabilityDesigner (${r.meta.simulated ? 'simulado' : r.meta.model})` });
    return updated;
  }

  async discard(id: string, comment: string, actor: Actor) {
    const p = await this.get(id);
    if (p.status !== 'DRAFT') throw new PlatformError('VERSION_CONFLICT', `La propuesta está ${p.status}`);
    await this.prisma.capabilityProposal.update({ where: { id: p.id }, data: { status: 'REJECTED', decidedBy: actor.id, decidedAt: new Date(), decisionComment: comment } });
    await this.core.audit.record({ actor, action: 'PROPOSAL_REJECTED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number} descartada${comment ? `: ${comment}` : ''}` });
  }

  /**
   * Efectos de la solicitud cerrada: crea la versión (si se aprobó el paso de catálogo), la activa y la asigna al
   * proyecto, en ese orden y solo con los pasos aprobados. Todo ocurre en la transacción de la última decisión.
   * Con el formato anterior (un solo ítem) solo crea la versión APROBADA, como antes.
   */
  async applyDecidedPlan(proposalId: string, items: ApprovalItem[], approver: Actor, tx: Prisma.TransactionClient) {
    const byKey = new Map(items.map((i) => [i.itemKey, i]));
    const ok = (k: string) => ['APPROVED', 'AUTO_APPROVED'].includes(byKey.get(k)?.status ?? '');
    const p = await tx.capabilityProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (byKey.has('deactivate')) return this.applyCancellation(p, byKey, ok, approver, tx);
    let ref = p.appliedVersionRef as { kind: CatalogKind; key: string; version: number; versionId: string } | null;
    if (byKey.has('proposal')) {
      if (!ok('proposal')) return this.markRejected(proposalId, approver, tx);
      ref = await this.applyApproved(proposalId, byKey.get('proposal')!.payload as { revision: number; definitionHash: string }, approver, tx);
    }
    if (!ref || !byKey.has('activation')) return;

    let activated = false;
    if (ok('activation')) {
      const v = await (tx as unknown as Record<string, { findUnique: (a: unknown) => Promise<{ checksum: string; sourceProposalId: string | null } | null> }>)[VERSION_MODEL[ref.kind]].findUnique({ where: { id: ref.versionId } });
      if (!v) throw notFound(`Versión ${ref.versionId}`);
      const expected = (byKey.get('activation')!.payload as { checksum?: string }).checksum;
      if (expected ? v.checksum !== expected : v.sourceProposalId !== p.id) throw new PlatformError('VERSION_CONFLICT', 'La versión a activar no corresponde a la propuesta aprobada');
      await this.core.catalog.applyActivation(ref.kind, ref.versionId, v.checksum, approver, tx);
      activated = true;
    }
    let assignedTo: string | null = null;
    if (activated && ok('assign')) {
      const { projectKey, skillKey } = byKey.get('assign')!.payload as { projectKey: string; skillKey: string };
      const project = await tx.project.findUniqueOrThrow({ where: { key: projectKey } });
      const row = await this.core.config.activeProjectConfigTx(project.id, tx);
      const cfg = row.config as Record<string, unknown>;
      const current = Array.isArray(cfg.projectSkills) ? (cfg.projectSkills as string[]) : [];
      if (!current.includes(skillKey)) {
        await this.core.config.saveProjectConfig(projectKey, { ...cfg, projectSkills: [...current, skillKey] }, `Skill ${skillKey} agregada desde la propuesta CP-${p.number}`, approver, tx);
      }
      assignedTo = projectKey;
    }
    const complete = activated && (!byKey.has('assign') || assignedTo !== null);
    await tx.capabilityProposal.update({ where: { id: p.id }, data: { status: complete ? 'APPLIED' : 'APPROVED', appliedVersionRef: { ...ref, activated, assignedTo } } });
    await this.core.audit.record(
      {
        actor: approver,
        action: complete ? 'PROPOSAL_APPLIED' : 'PROPOSAL_PARTIALLY_APPLIED',
        entityType: 'CapabilityProposal',
        entityId: p.id,
        summary: `CP-${p.number}: ${ref.key} v${ref.version}${activated ? ' activada' : ' sin activar'}${assignedTo ? ` y agregada al proyecto ${assignedTo}` : byKey.has('assign') ? ' (sin asignar)' : ''}`,
      },
      tx,
    );
  }

  /** Cancelar una capacidad existente: quitarla del proyecto de origen y desactivarla (solo los pasos aprobados). */
  private async applyCancellation(
    p: { id: string; number: number; kind: string; targetKey: string },
    byKey: Map<string, ApprovalItem>,
    ok: (k: string) => boolean,
    approver: Actor,
    tx: Prisma.TransactionClient,
  ) {
    const kind = KIND_TO_CATALOG[p.kind]!;
    let unassigned: string | null = null;
    if (ok('unassign')) {
      const { projectKey, skillKey } = byKey.get('unassign')!.payload as { projectKey: string; skillKey: string };
      const project = await tx.project.findUniqueOrThrow({ where: { key: projectKey } });
      const row = await this.core.config.activeProjectConfigTx(project.id, tx);
      const cfg = row.config as Record<string, unknown>;
      const current = Array.isArray(cfg.projectSkills) ? (cfg.projectSkills as string[]) : [];
      if (current.includes(skillKey)) {
        await this.core.config.saveProjectConfig(projectKey, { ...cfg, projectSkills: current.filter((k) => k !== skillKey) }, `Skill ${skillKey} quitada desde la propuesta CP-${p.number}`, approver, tx);
      }
      unassigned = projectKey;
    }
    const deactivated = ok('deactivate');
    if (deactivated) await this.core.catalog.deactivate(kind, p.targetKey, approver, tx);
    if (!deactivated && !unassigned) return this.markRejected(p.id, approver, tx);
    const complete = deactivated && (!byKey.has('unassign') || unassigned !== null);
    await tx.capabilityProposal.update({
      where: { id: p.id },
      data: { status: complete ? 'APPLIED' : 'APPROVED', decidedBy: approver.id, decidedAt: new Date(), appliedVersionRef: { kind, key: p.targetKey, cancelled: deactivated, unassignedFrom: unassigned } },
    });
    await this.core.audit.record({ actor: approver, action: 'PROPOSAL_APPLIED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number}: ${p.targetKey}${deactivated ? ' desactivado' : ''}${unassigned ? ` y quitado del proyecto ${unassigned}` : ''}` }, tx);
  }

  /** Paso de catálogo: crea la versión APROBADA (no activa) en el catálogo. */
  async applyApproved(proposalId: string, payload: { revision: number; definitionHash: string }, approver: Actor, tx: Prisma.TransactionClient) {
    const p = await tx.capabilityProposal.findUniqueOrThrow({ where: { id: proposalId } });
    if (p.revision !== payload.revision || contentHash(p.definition) !== payload.definitionHash) {
      throw new PlatformError('VERSION_CONFLICT', 'La propuesta cambió después de enviarse a aprobación');
    }
    const kind = KIND_TO_CATALOG[p.kind];
    if (!kind) throw new PlatformError('VALIDATION_ERROR', 'Tipo de propuesta no aplicable');
    const exists = await (tx as unknown as Record<string, { findUnique: (a: unknown) => Promise<unknown> }>)[kind].findUnique({ where: { key: p.targetKey } });
    const note = `Desde propuesta CP-${p.number} (revisión ${p.revision})`;
    const res = exists
      ? await this.core.catalog.createVersion(kind, p.targetKey, p.definition, note, approver, { versionStatus: 'APPROVED', sourceProposalId: p.id, tx })
      : await this.core.catalog.create(kind, p.targetKey, p.definition, note, approver, { versionStatus: 'APPROVED', sourceProposalId: p.id, tx });
    await tx.capabilityProposal.update({
      where: { id: p.id },
      data: { status: 'APPROVED', decidedBy: approver.id, decidedAt: new Date(), appliedVersionRef: { kind, key: p.targetKey, version: res.version.version, versionId: res.version.id } },
    });
    await this.core.audit.record({ actor: approver, action: 'PROPOSAL_APPROVED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number} aprobada: ${kind} ${p.targetKey} v${res.version.version} (APROBADA, sin activar)` }, tx);
    return { kind, key: p.targetKey, version: res.version.version as number, versionId: res.version.id as string };
  }

  async markRejected(proposalId: string, actor: Actor, tx: Prisma.TransactionClient) {
    const p = await tx.capabilityProposal.update({ where: { id: proposalId }, data: { status: 'REJECTED', decidedBy: actor.id, decidedAt: new Date() } });
    await this.core.audit.record({ actor, action: 'PROPOSAL_REJECTED', entityType: 'CapabilityProposal', entityId: p.id, summary: `CP-${p.number} rechazada` }, tx);
  }
}
