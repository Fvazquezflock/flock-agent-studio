import type { ApprovalMode, OperationType } from '@mao/shared';
import type { ApprovalItem, ApprovalItemStatus, Prisma } from '@mao/db';
import type { Core } from '../core';
import type { Actor } from '../context';
import { SYSTEM_ACTOR } from '../context';
import type { CatalogKind } from '../catalog/validation';
import { emitEvent } from '../engine/events';
import { contentHash, sha256 } from '../util/hash';
import { PlatformError, invalid, notFound } from '../util/errors';
import { EDITABLE_OPERATIONS, payloadSchemaFor } from './payloads';

/** Motivo de un ítem: por qué se crea, modifica o cancela, con evidencia verificable (claves, secciones de la épica). */
export interface ItemRationale {
  reason: string;
  evidence: string[];
  /** Inconsistencias concretas encontradas por los agentes (p. ej. problemas de la validación de la HU). */
  inconsistencies?: { id?: string; severity?: string; description: string; evidence?: string }[];
}

export interface ItemDraft {
  itemKey: string;
  group: string;
  operationType: OperationType;
  title: string;
  payload: Record<string, unknown>;
  original?: unknown;
  dependsOn?: string[];
  /** CREATE | UPDATE | CANCEL (si falta se deduce del tipo de operación). */
  action?: ItemAction;
  rationale?: ItemRationale;
}

export type ItemAction = 'CREATE' | 'UPDATE' | 'CANCEL';

/** Acción por defecto según la operación (los constructores la indican explícitamente cuando la conocen). */
export function actionFor(operationType: string): ItemAction | null {
  if (operationType === 'CREATE_ISSUE' || operationType === 'CREATE_ISSUE_LINK') return 'CREATE';
  if (operationType === 'UPDATE_ISSUE') return 'UPDATE';
  if (operationType === 'TRANSITION_ISSUE') return 'CANCEL';
  return null;
}

export interface ExecutionRequestInput {
  executionId: string;
  projectId: string;
  orchestratorKey: string;
  stepKey: string;
  kind: string;
  title: string;
  summary: string;
  items: ItemDraft[];
  supersedesId?: string;
}

/** Hash de decisión: cambia si cambia cualquier contenido o estado de los ítems. */
export function decisionHash(items: Pick<ApprovalItem, 'itemKey' | 'revision' | 'payloadHash' | 'status'>[]): string {
  return sha256(
    [...items]
      .sort((a, b) => a.itemKey.localeCompare(b.itemKey))
      .map((i) => `${i.itemKey}:${i.revision}:${i.payloadHash}:${i.status}`)
      .join('|'),
  );
}

const DECIDED: ApprovalItemStatus[] = ['APPROVED', 'REJECTED', 'DENIED_BY_POLICY', 'AUTO_APPROVED'];

export class ApprovalService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  // ---------- Creación ----------

  /** Solicitud para operaciones externas de una ejecución. Aplica la política a cada ítem. */
  async createExecutionRequest(input: ExecutionRequestInput, tx?: Prisma.TransactionClient) {
    const run = async (db: Prisma.TransactionClient) => {
      const policies = await this.core.policies.listActive();
      const { resolvePolicy } = await import('../policies/policy-engine');
      const items = input.items.map((it) => {
        const schema = payloadSchemaFor(it.operationType);
        const payload = schema ? (schema.parse(it.payload) as Record<string, unknown>) : it.payload;
        const policy = resolvePolicy(policies, it.operationType, { projectId: input.projectId, orchestratorKey: input.orchestratorKey });
        const payloadHash = contentHash(payload);
        const status: ApprovalItemStatus = policy.mode === 'DENIED' ? 'DENIED_BY_POLICY' : policy.mode === 'AUTO_APPROVED' ? 'AUTO_APPROVED' : 'PENDING';
        return { it, payload, payloadHash, policy, status };
      });
      const snapshot = {
        kind: input.kind,
        items: items.map(({ it, payload, payloadHash, policy }) => ({
          itemKey: it.itemKey,
          group: it.group,
          operationType: it.operationType,
          title: it.title,
          payload,
          payloadHash,
          original: it.original ?? null,
          dependsOn: it.dependsOn ?? [],
          action: it.action ?? actionFor(it.operationType),
          rationale: it.rationale ?? null,
          policy: { mode: policy.mode, id: policy.policyId, version: policy.policyVersion, reasons: policy.reasons },
        })),
      };
      const pending = items.some((i) => i.status === 'PENDING');
      const request = await db.approvalRequest.create({
        data: {
          executionId: input.executionId,
          stepKey: input.stepKey,
          projectId: input.projectId,
          kind: input.kind,
          title: input.title,
          summary: input.summary,
          status: pending ? 'PENDING' : 'DECIDED',
          snapshot: snapshot as object,
          snapshotHash: contentHash(snapshot),
          supersedesId: input.supersedesId,
          items: {
            create: items.map(({ it, payload, payloadHash, policy, status }) => ({
              itemKey: it.itemKey,
              group: it.group,
              operationType: it.operationType,
              title: it.title,
              payload: payload as object,
              payloadHash,
              original: (it.original ?? undefined) as object | undefined,
              dependsOn: it.dependsOn ?? [],
              action: it.action ?? actionFor(it.operationType),
              rationale: (it.rationale ?? undefined) as object | undefined,
              status,
              policyId: policy.policyId,
              policyMode: policy.mode,
              policyVersion: policy.policyVersion,
              approvedHash: status === 'AUTO_APPROVED' ? payloadHash : null,
              decidedAt: status === 'PENDING' ? null : new Date(),
              note: status === 'DENIED_BY_POLICY' ? `Denegado por política: ${policy.reasons.join('; ')}` : status === 'AUTO_APPROVED' ? `Autoaprobado por política: ${policy.reasons.join('; ')}` : null,
            })),
          },
        },
        include: { items: true },
      });
      const auto = request.items.filter((i) => i.status === 'AUTO_APPROVED' || i.status === 'DENIED_BY_POLICY');
      if (auto.length) {
        await db.approvalDecision.create({
          data: {
            requestId: request.id,
            decision: 'POLICY',
            approver: SYSTEM_ACTOR.id,
            approverType: 'SYSTEM',
            channel: 'POLICY',
            comment: 'Decisión automática aplicada por política',
            items: auto.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: i.status, policyId: i.policyId, policyMode: i.policyMode, policyVersion: i.policyVersion })),
          },
        });
      }
      await emitEvent(db, input.executionId, 'APPROVAL_REQUESTED', `Solicitud de aprobación AP-${request.number}: ${request.items.length} operación(es)`, {
        stepKey: input.stepKey,
        data: { approvalId: request.id, number: request.number, pending: request.items.filter((i) => i.status === 'PENDING').length },
      });
      await this.core.audit.record(
        {
          actor: SYSTEM_ACTOR,
          action: 'APPROVAL_REQUESTED',
          entityType: 'ApprovalRequest',
          entityId: request.id,
          projectId: input.projectId,
          executionId: input.executionId,
          summary: `AP-${request.number} "${input.title}" (${request.items.length} ítems)`,
        },
        db,
      );
      return request;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Solicitud de activación de una versión del catálogo. */
  async createActivationRequest(input: {
    kind: CatalogKind;
    operationType: OperationType;
    key: string;
    versionId: string;
    versionNumber: number;
    checksum: string;
    definition: unknown;
    previousActive: { version: number; definition: unknown } | null;
    actor: Actor;
  }) {
    const policy = await this.core.policies.resolve(input.operationType);
    if (policy.mode === 'DENIED') throw new PlatformError('AUTHORIZATION_ERROR', `La política deniega ${input.operationType}`);
    const payload = { kind: input.kind, key: input.key, versionId: input.versionId, version: input.versionNumber, checksum: input.checksum, definition: input.definition };
    const snapshot = { kind: 'activation', items: [{ itemKey: 'activation', operationType: input.operationType, payload, original: input.previousActive }] };
    const request = await this.prisma.approvalRequest.create({
      data: {
        kind: 'activation',
        title: `Activar ${input.kind} ${input.key} v${input.versionNumber}`,
        summary: input.previousActive ? `Reemplaza la versión activa v${input.previousActive.version}` : 'Primera activación',
        snapshot: snapshot as object,
        snapshotHash: contentHash(snapshot),
        subjectType: input.kind,
        subjectId: input.versionId,
        items: {
          create: [
            {
              itemKey: 'activation',
              group: 'Activación',
              operationType: input.operationType,
              title: `${input.key} v${input.versionNumber}`,
              payload: payload as object,
              payloadHash: contentHash(payload),
              original: (input.previousActive?.definition ?? undefined) as object | undefined,
              status: 'PENDING',
              policyId: policy.policyId,
              policyMode: policy.mode,
              policyVersion: policy.policyVersion,
            },
          ],
        },
      },
      include: { items: true },
    });
    await this.core.audit.record({ actor: input.actor, action: 'ACTIVATION_REQUESTED', entityType: input.kind, entityId: input.key, summary: `Solicitud AP-${request.number}: activar ${input.key} v${input.versionNumber}` });
    return request;
  }

  /**
   * Solicitud con el plan de implementación de una propuesta de capacidad: crear la versión, activarla y asignarla
   * al proyecto de origen, como ítems dependientes. Cada ítem conserva su política (aprobación individual): el
   * backend aplica el plan recién cuando todos los ítems están decididos.
   */
  async createProposalPlanRequest(
    proposal: { id: string; number: number; revision: number; kind: string; targetKey: string; title: string; projectId: string | null },
    steps: ItemDraft[],
    actor: Actor,
  ) {
    const items = [];
    for (const s of steps) {
      const policy = await this.core.policies.resolve(s.operationType, { projectId: proposal.projectId ?? undefined });
      if (policy.mode === 'DENIED') throw new PlatformError('AUTHORIZATION_ERROR', `La política deniega ${s.operationType} ("${s.title}")`);
      items.push({ s, policy, payloadHash: contentHash(s.payload) });
    }
    const snapshot = {
      kind: 'capability_proposal',
      items: items.map(({ s, payloadHash, policy }) => ({ itemKey: s.itemKey, group: s.group, operationType: s.operationType, title: s.title, payload: s.payload, payloadHash, dependsOn: s.dependsOn ?? [], policy: { mode: policy.mode, id: policy.policyId, version: policy.policyVersion } })),
    };
    const request = await this.prisma.approvalRequest.create({
      data: {
        kind: 'capability_proposal',
        title: `Propuesta CP-${proposal.number}: ${proposal.title}`,
        summary: `${proposal.kind} ${proposal.targetKey} (revisión ${proposal.revision}): ${steps.map((s) => s.title).join(' → ')}`,
        projectId: proposal.projectId,
        snapshot: snapshot as object,
        snapshotHash: contentHash(snapshot),
        subjectType: 'CapabilityProposal',
        subjectId: proposal.id,
        items: {
          create: items.map(({ s, policy, payloadHash }) => ({
            itemKey: s.itemKey,
            group: s.group,
            operationType: s.operationType,
            title: s.title,
            payload: s.payload as object,
            payloadHash,
            dependsOn: s.dependsOn ?? [],
            status: 'PENDING' as const,
            policyId: policy.policyId,
            policyMode: policy.mode,
            policyVersion: policy.policyVersion,
          })),
        },
      },
      include: { items: true },
    });
    await this.core.audit.record({ actor, action: 'PROPOSAL_SUBMITTED', entityType: 'CapabilityProposal', entityId: proposal.id, projectId: proposal.projectId, summary: `CP-${proposal.number} enviada a aprobación (AP-${request.number}, ${steps.length} paso(s))` });
    return request;
  }

  /** Reemplaza una solicitud abierta sin aplicar nada (p. ej. una propuesta con el formato anterior de un solo paso). */
  async supersede(requestId: string, reason: string, channel: string, actor: Actor) {
    const req = await this.get(requestId);
    if (!['PENDING', 'PARTIALLY_DECIDED'].includes(req.status)) throw new PlatformError('VERSION_CONFLICT', `La solicitud está ${req.status}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalDecision.create({
        data: { requestId: req.id, decision: 'SUPERSEDED', approver: actor.id, approverType: actor.type, channel, comment: reason, items: req.items.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: 'SUPERSEDED' })) },
      });
      await tx.approvalRequest.update({ where: { id: req.id }, data: { status: 'SUPERSEDED' } });
      await this.core.audit.record({ actor, action: 'APPROVAL_SUPERSEDED', entityType: 'ApprovalRequest', entityId: req.id, projectId: req.projectId, summary: `AP-${req.number} reemplazada: ${reason}` }, tx);
    });
  }

  // ---------- Consulta ----------

  async list(filters: { status?: string; executionId?: string; kind?: string; limit?: number } = {}) {
    const where: Prisma.ApprovalRequestWhereInput = {};
    if (filters.status === 'OPEN') where.status = { in: ['PENDING', 'PARTIALLY_DECIDED'] };
    else if (filters.status) where.status = filters.status as Prisma.EnumApprovalRequestStatusFilter['equals'];
    if (filters.executionId) where.executionId = filters.executionId;
    if (filters.kind) where.kind = filters.kind;
    const rows = await this.prisma.approvalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 100, 300),
      include: { items: { select: { status: true, operationType: true, policyMode: true } }, project: { select: { key: true, name: true } }, execution: { select: { number: true, source: true } } },
    });
    return rows.map(({ items, ...r }) => ({
      ...r,
      counts: items.reduce<Record<string, number>>((acc, i) => ((acc[i.status] = (acc[i.status] ?? 0) + 1), acc), {}),
      itemCount: items.length,
    }));
  }

  async get(id: string) {
    const r = await this.prisma.approvalRequest.findFirst({
      where: /^\d+$/.test(id) ? { number: Number(id) } : { id },
      include: {
        items: { orderBy: [{ group: 'asc' }, { itemKey: 'asc' }] },
        decisions: { orderBy: { createdAt: 'asc' } },
        project: { select: { key: true, name: true, mode: true } },
        execution: { select: { id: true, number: true, source: true, status: true, simulation: true } },
      },
    });
    if (!r) throw notFound(`Solicitud de aprobación ${id}`);
    const ops = r.executionId
      ? await this.prisma.externalOperation.findMany({ where: { executionId: r.executionId, approvalItemId: { in: r.items.map((i) => i.id) } } })
      : [];
    return { ...r, decisionHash: decisionHash(r.items), operations: ops };
  }

  // ---------- Edición ----------

  /** Edita el contenido de un ítem antes de decidir. Cada edición es una revisión; si estaba aprobado, vuelve a PENDING. */
  async editItem(requestId: string, itemId: string, payload: Record<string, unknown>, note: string, actor: Actor) {
    const req = await this.get(requestId);
    if (!['PENDING', 'PARTIALLY_DECIDED'].includes(req.status)) throw new PlatformError('VERSION_CONFLICT', `La solicitud está ${req.status}; ya no admite ediciones.`);
    const item = req.items.find((i) => i.id === itemId || i.itemKey === itemId);
    if (!item) throw notFound(`Ítem ${itemId}`);
    if (!EDITABLE_OPERATIONS.includes(item.operationType)) throw new PlatformError('VALIDATION_ERROR', 'Este tipo de ítem se edita en su origen (catálogo o propuesta), no desde la aprobación.');
    if (!['PENDING', 'APPROVED', 'CONFLICT'].includes(item.status)) throw new PlatformError('VERSION_CONFLICT', `El ítem está ${item.status}`);
    const schema = payloadSchemaFor(item.operationType)!;
    const merged = { ...(item.payload as Record<string, unknown>), ...payload };
    // Campos de control que el usuario no puede alterar.
    for (const k of ['projectKey', 'issueKey', 'baseUpdated', 'baseHash', 'parentRef', 'parentKey', 'inwardRef', 'outwardRef']) {
      if (k in (item.payload as object)) merged[k] = (item.payload as Record<string, unknown>)[k];
    }
    const parsed = schema.safeParse(merged);
    if (!parsed.success) throw invalid('Contenido inválido', { issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    const newHash = contentHash(parsed.data);
    if (newHash === item.payloadHash) return item;
    const history = [...((item.history as unknown[]) ?? []), { revision: item.revision, payload: item.payload, payloadHash: item.payloadHash, status: item.status, editedAt: new Date().toISOString(), editedBy: actor.id, note }];
    const wasApproved = item.status === 'APPROVED';
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.approvalItem.update({
        where: { id: item.id },
        data: { payload: parsed.data as object, payloadHash: newHash, revision: item.revision + 1, history: history as object, status: 'PENDING', approvedHash: null, decidedAt: null, note: wasApproved ? 'Aprobación invalidada por edición: requiere nueva aprobación' : note || null },
      });
      if (req.status === 'PARTIALLY_DECIDED' || wasApproved) await tx.approvalRequest.update({ where: { id: req.id }, data: { status: 'PARTIALLY_DECIDED' } });
      await this.core.audit.record(
        {
          actor,
          action: 'APPROVAL_ITEM_EDITED',
          entityType: 'ApprovalItem',
          entityId: item.id,
          projectId: req.projectId,
          executionId: req.executionId,
          summary: `AP-${req.number} · ${item.title}: revisión ${item.revision + 1}${wasApproved ? ' (aprobación invalidada)' : ''}`,
          data: { before: item.payload, after: parsed.data, note },
        },
        tx,
      );
      if (req.executionId) await emitEvent(tx, req.executionId, 'APPROVAL_ITEM_EDITED', `Ítem "${item.title}" editado (revisión ${item.revision + 1})`, { stepKey: req.stepKey });
      return u;
    });
    return updated;
  }

  // ---------- Decisión ----------

  async decide(requestId: string, input: { approve: string[]; reject: string[]; comment: string; channel: string; confirmHash?: string }, actor: Actor) {
    const req = await this.get(requestId);
    if (!['PENDING', 'PARTIALLY_DECIDED'].includes(req.status)) throw new PlatformError('VERSION_CONFLICT', `La solicitud está ${req.status}`);
    if ((input.channel === 'CLI' || input.channel === 'CLAUDE_CODE') && !input.confirmHash) {
      throw new PlatformError('VALIDATION_ERROR', 'Desde la CLI la decisión requiere --confirm con el hash mostrado en `mao approval show`.');
    }
    if (input.confirmHash && !req.decisionHash.startsWith(input.confirmHash)) {
      throw new PlatformError('VERSION_CONFLICT', 'El contenido cambió desde que lo revisaste: volvé a consultarlo antes de decidir.');
    }
    const byRef = (ref: string) => req.items.find((i) => i.id === ref || i.itemKey === ref);
    const approve = input.approve.map((r) => byRef(r) ?? (() => { throw notFound(`Ítem ${r}`); })());
    const reject = input.reject.map((r) => byRef(r) ?? (() => { throw notFound(`Ítem ${r}`); })());
    if (!approve.length && !reject.length) throw invalid('Indicá al menos un ítem para aprobar o rechazar');
    for (const i of [...approve, ...reject]) {
      if (!['PENDING', 'CONFLICT'].includes(i.status)) throw new PlatformError('VERSION_CONFLICT', `"${i.title}" ya está ${i.status}`);
    }
    if (approve.some((a) => reject.includes(a))) throw invalid('Un ítem no puede aprobarse y rechazarse a la vez');

    // La política se vuelve a evaluar en el momento de decidir (puede haber cambiado).
    const fresh = new Map<string, { mode: ApprovalMode; policyId: string | null; policyVersion: number | null }>();
    const ex = req.executionId
      ? await this.prisma.execution.findUnique({ where: { id: req.executionId }, select: { orchestratorVersion: { select: { orchestrator: { select: { key: true } } } } } })
      : null;
    const orchestratorKey = ex?.orchestratorVersion.orchestrator.key;
    for (const i of approve) {
      const p = await this.core.policies.resolve(i.operationType as OperationType, { projectId: req.projectId, orchestratorKey });
      fresh.set(i.id, p);
      if (p.mode === 'DENIED') throw new PlatformError('AUTHORIZATION_ERROR', `La política actual deniega ${i.operationType} ("${i.title}")`);
    }
    if (approve.length > 1) {
      const individual = approve.filter((i) => fresh.get(i.id)!.mode === 'ALWAYS_APPROVE');
      if (individual.length) throw new PlatformError('AUTHORIZATION_ERROR', `Requieren aprobación individual: ${individual.map((i) => `"${i.title}"`).join(', ')}`);
    }
    // Un ítem no puede aprobarse si depende de otro rechazado o denegado.
    const rejectedKeys = new Set([...req.items.filter((i) => ['REJECTED', 'DENIED_BY_POLICY'].includes(i.status)).map((i) => i.itemKey), ...reject.map((i) => i.itemKey)]);
    for (const i of approve) {
      const blocked = i.dependsOn.filter((d) => rejectedKeys.has(d));
      if (blocked.length) throw new PlatformError('VALIDATION_ERROR', `No se puede aprobar "${i.title}": depende de ${blocked.join(', ')}, que fue rechazado.`);
    }
    // Rechazo en cascada de dependientes.
    const cascade: ApprovalItem[] = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (const i of req.items) {
        if (i.status !== 'PENDING' || approve.includes(i) || reject.includes(i) || cascade.includes(i)) continue;
        if (i.dependsOn.some((d) => rejectedKeys.has(d))) {
          cascade.push(i);
          rejectedKeys.add(i.itemKey);
          changed = true;
        }
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const decisionItems = [
        ...approve.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: 'APPROVED', policyId: fresh.get(i.id)!.policyId, policyMode: fresh.get(i.id)!.mode, policyVersion: fresh.get(i.id)!.policyVersion })),
        ...reject.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: 'REJECTED', policyId: i.policyId, policyMode: i.policyMode, policyVersion: i.policyVersion })),
        ...cascade.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: 'REJECTED_CASCADE', policyId: i.policyId, policyMode: i.policyMode, policyVersion: i.policyVersion })),
      ];
      const decision = await tx.approvalDecision.create({
        data: {
          requestId: req.id,
          decision: approve.length && (reject.length || cascade.length) ? 'PARTIAL' : approve.length ? 'APPROVE' : 'REJECT',
          approver: actor.id,
          approverType: actor.type,
          channel: input.channel,
          comment: input.comment,
          items: decisionItems,
        },
      });
      const now = new Date();
      for (const i of approve) await tx.approvalItem.update({ where: { id: i.id }, data: { status: 'APPROVED', approvedHash: i.payloadHash, decidedAt: now, decisionId: decision.id, policyMode: fresh.get(i.id)!.mode, policyId: fresh.get(i.id)!.policyId, policyVersion: fresh.get(i.id)!.policyVersion } });
      for (const i of reject) await tx.approvalItem.update({ where: { id: i.id }, data: { status: 'REJECTED', decidedAt: now, decisionId: decision.id, approvedHash: null } });
      for (const i of cascade) await tx.approvalItem.update({ where: { id: i.id }, data: { status: 'REJECTED', decidedAt: now, decisionId: decision.id, approvedHash: null, note: 'Rechazado porque depende de un ítem rechazado' } });

      const items = await tx.approvalItem.findMany({ where: { requestId: req.id } });
      const allDecided = items.every((i) => DECIDED.includes(i.status));
      await tx.approvalRequest.update({ where: { id: req.id }, data: { status: allDecided ? 'DECIDED' : 'PARTIALLY_DECIDED' } });

      await this.core.audit.record(
        {
          actor,
          action: 'APPROVAL_DECIDED',
          entityType: 'ApprovalRequest',
          entityId: req.id,
          projectId: req.projectId,
          executionId: req.executionId,
          summary: `AP-${req.number}: ${approve.length} aprobado(s), ${reject.length + cascade.length} rechazado(s)${input.comment ? ` — "${input.comment}"` : ''}`,
          data: { decisionId: decision.id, items: decisionItems, channel: input.channel },
        },
        tx,
      );

      if (allDecided) await this.onRequestDecided(req.id, actor, tx);
      return { decision, status: allDecided ? 'DECIDED' : 'PARTIALLY_DECIDED' };
    });
  }

  /** Efectos al cerrar una solicitud: activar versiones, aplicar propuestas o reanudar la ejecución. */
  private async onRequestDecided(requestId: string, actor: Actor, tx: Prisma.TransactionClient) {
    const req = await tx.approvalRequest.findUniqueOrThrow({ where: { id: requestId }, include: { items: true } });
    const item = req.items[0];
    if (req.kind === 'activation' && req.subjectType && req.subjectId) {
      const p = item.payload as { checksum: string };
      if (item.status === 'APPROVED') await this.core.catalog.applyActivation(req.subjectType as CatalogKind, req.subjectId, p.checksum, actor, tx);
      else await this.core.catalog.rejectActivation(req.subjectType as CatalogKind, req.subjectId, actor, tx);
      return;
    }
    if (req.kind === 'capability_proposal' && req.subjectId) {
      // Plan de implementación (crear → activar → asignar) o formato anterior de un solo ítem.
      await this.core.proposals.applyDecidedPlan(req.subjectId, req.items, actor, tx);
      return;
    }
    if (req.executionId) {
      await emitEvent(tx, req.executionId, 'APPROVAL_DECIDED', `Solicitud AP-${req.number} resuelta: ${req.items.filter((i) => i.status === 'APPROVED' || i.status === 'AUTO_APPROVED').length} operación(es) autorizada(s)`, {
        stepKey: req.stepKey,
        level: 'success',
      });
      await tx.execution.updateMany({ where: { id: req.executionId, status: 'WAITING_APPROVAL' }, data: { status: 'PENDING', nextRunAt: null } });
    }
  }

  /** Cierra la revisión: lo pendiente queda rechazado (no se publica). */
  async close(requestId: string, comment: string, channel: string, actor: Actor) {
    const req = await this.get(requestId);
    const pending = req.items.filter((i) => i.status === 'PENDING' || i.status === 'CONFLICT');
    if (!pending.length) throw new PlatformError('VERSION_CONFLICT', 'No hay ítems pendientes');
    return this.decide(req.id, { approve: [], reject: pending.map((i) => i.id), comment: comment || 'Revisión cerrada: lo pendiente no se publica', channel, confirmHash: req.decisionHash.slice(0, 12) }, actor);
  }

  /** Rechaza y pide regenerar: la solicitud queda SUPERSEDED y el motor vuelve a correr las etapas de generación. */
  async regenerate(requestId: string, feedback: string, channel: string, actor: Actor) {
    const req = await this.get(requestId);
    if (!req.executionId || !req.stepKey) throw new PlatformError('VALIDATION_ERROR', 'Solo las solicitudes de una ejecución pueden regenerarse');
    if (!['PENDING', 'PARTIALLY_DECIDED'].includes(req.status)) throw new PlatformError('VERSION_CONFLICT', `La solicitud está ${req.status}`);
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalDecision.create({
        data: { requestId: req.id, decision: 'REGENERATE', approver: actor.id, approverType: actor.type, channel, comment: feedback, items: req.items.map((i) => ({ itemKey: i.itemKey, revision: i.revision, payloadHash: i.payloadHash, decision: 'SUPERSEDED' })) },
      });
      await tx.approvalRequest.update({ where: { id: req.id }, data: { status: 'SUPERSEDED' } });
      await this.core.audit.record({ actor, action: 'APPROVAL_REGENERATE', entityType: 'ApprovalRequest', entityId: req.id, executionId: req.executionId, projectId: req.projectId, summary: `AP-${req.number} rechazada para regenerar: "${feedback}"` }, tx);
    });
    await this.core.engine.resetForRegeneration(req.executionId, req.stepKey, feedback, actor);
    return { status: 'SUPERSEDED' };
  }
}
