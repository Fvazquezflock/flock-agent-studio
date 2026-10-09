import type { OperationType, ProjectConfig } from '@mao/shared';
import type { ApprovalItem, ExternalOperation } from '@mao/db';
import type { Core } from '../core';
import { SYSTEM_ACTOR } from '../context';
import { createIssuePayload, createLinkPayload, updateIssuePayload, transitionIssuePayload } from '../approvals/payloads';
import type { IJiraGateway } from '../jira/types';
import { issueVersionHash } from '../jira/issue-hash';
import { contentHash, sha256 } from '../util/hash';
import { PlatformError, isRetryable, toPlatformError } from '../util/errors';

export type PublicationStatus = 'SUCCEEDED' | 'SIMULATED' | 'SKIPPED' | 'FAILED' | 'BLOCKED' | 'CONFLICT';

export interface PublicationResult {
  itemKey: string;
  title: string;
  operationType: string;
  status: PublicationStatus;
  key?: string;
  simulated?: boolean;
  message?: string;
  operationId?: string;
  conflict?: { current: { summary: string; description: string; status: string; updated?: string } };
}

export interface PublicationContext {
  executionId: string;
  executionNumber: number;
  projectId: string;
  orchestratorKey: string;
  correlationId: string;
  config: ProjectConfig;
  gateway: IJiraGateway;
  /** itemKey → clave creada (o simulada) para resolver referencias entre ítems. */
  created: Map<string, string>;
  writeEnabled: boolean;
  /** Issues que esta misma publicación ya modificó: sus cambios no cuentan como conflicto para la operación siguiente. */
  touched?: Set<string>;
}

/**
 * Único camino hacia las escrituras externas. Antes de cada operación verifica en el backend:
 * aprobación vigente sobre exactamente ese contenido, política actual, modo del proyecto y habilitación de escritura.
 * Las operaciones son idempotentes (clave interna) y se reconcilian contra Jira si el resultado fue incierto.
 */
export class PublicationService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  /** Autorización (se aplica siempre; nunca depende del modelo). */
  async authorize(item: ApprovalItem, ctx: PublicationContext): Promise<string | null> {
    if (item.status !== 'APPROVED' && item.status !== 'AUTO_APPROVED') return `El ítem no está aprobado (${item.status})`;
    if (!item.approvedHash || item.approvedHash !== item.payloadHash) return 'El contenido cambió después de la aprobación: requiere nueva aprobación';
    if (contentHash(item.payload) !== item.payloadHash) return 'El contenido almacenado no coincide con su hash aprobado';
    const policy = await this.core.policies.resolve(item.operationType as OperationType, { projectId: ctx.projectId, orchestratorKey: ctx.orchestratorKey });
    if (policy.mode === 'DENIED') return `La política vigente deniega ${item.operationType}`;
    if (item.status === 'AUTO_APPROVED' && policy.mode !== 'AUTO_APPROVED') return 'La autoaprobación ya no está permitida por la política vigente';
    if (ctx.gateway.mode === 'LIVE' && !ctx.writeEnabled) return 'La escritura real en Jira no está habilitada (conexión o MAO_ALLOW_JIRA_WRITES)';
    return null;
  }

  private ref(ctx: PublicationContext, ref?: string, key?: string): string | undefined {
    if (key) return key;
    if (ref) return ctx.created.get(ref);
    return undefined;
  }

  /** Payload efectivo con referencias resueltas (y etiqueta de correlación en altas reales). */
  private resolvePayload(item: ApprovalItem, ctx: PublicationContext): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
    const p = item.payload as Record<string, unknown>;
    if (item.operationType === 'CREATE_ISSUE') {
      const c = createIssuePayload.parse(p);
      const parentKey = c.parentRef ? ctx.created.get(c.parentRef) : c.parentKey;
      if (c.parentRef && !parentKey) return { ok: false, reason: `El padre (${c.parentRef}) no fue publicado` };
      const labels = [...c.labels];
      if (ctx.config.jira.correlationLabel && ctx.gateway.mode === 'LIVE') labels.push(`mao-${ctx.correlationId.slice(0, 8)}`);
      return { ok: true, payload: { ...c, parentKey, parentRef: undefined, labels } };
    }
    if (item.operationType === 'CREATE_ISSUE_LINK') {
      const l = createLinkPayload.parse(p);
      const inward = this.ref(ctx, l.inwardRef, l.inwardKey);
      const outward = this.ref(ctx, l.outwardRef, l.outwardKey);
      if (!inward || !outward) return { ok: false, reason: 'Algún extremo del vínculo no fue publicado' };
      return { ok: true, payload: { linkType: l.linkType, inwardKey: inward, outwardKey: outward } };
    }
    if (item.operationType === 'UPDATE_ISSUE') return { ok: true, payload: updateIssuePayload.parse(p) };
    if (item.operationType === 'TRANSITION_ISSUE') {
      const t = transitionIssuePayload.parse(p);
      if (!t.transitionId && ctx.gateway.mode === 'LIVE') {
        return { ok: false, reason: 'Falta mapear la transición de cancelación del proyecto (Configuración → Proyectos → Jira, tras descubrir tipos y campos)' };
      }
      return { ok: true, payload: t };
    }
    return { ok: false, reason: `Operación no publicable: ${item.operationType}` };
  }

  async publishItem(item: ApprovalItem, ctx: PublicationContext): Promise<PublicationResult> {
    const base = { itemKey: item.itemKey, title: item.title, operationType: item.operationType };
    const denial = await this.authorize(item, ctx);
    if (denial) {
      await this.core.audit.record({ actor: SYSTEM_ACTOR, action: 'WRITE_REJECTED', entityType: 'ApprovalItem', entityId: item.id, executionId: ctx.executionId, projectId: ctx.projectId, summary: `Escritura rechazada: ${item.title} — ${denial}` });
      return { ...base, status: 'BLOCKED', message: denial };
    }
    const resolved = this.resolvePayload(item, ctx);
    if (!resolved.ok) return { ...base, status: 'SKIPPED', message: resolved.reason };
    const payload = resolved.payload;
    const payloadHash = contentHash(payload);
    const idempotencyKey = sha256(`${ctx.executionId}|${item.itemKey}|${payloadHash}`);
    const mode = ctx.gateway.mode === 'DEMO' ? 'SIMULATED' : 'LIVE';
    const target = String(payload.issueKey ?? payload.projectKey ?? `${payload.outwardKey}->${payload.inwardKey}`);

    let op = await this.prisma.externalOperation.findUnique({ where: { idempotencyKey } });
    if (op && (op.status === 'SUCCEEDED' || op.status === 'SIMULATED')) {
      const key = (op.result as { key?: string } | null)?.key;
      if (key) ctx.created.set(item.itemKey, key);
      return { ...base, status: op.status === 'SIMULATED' ? 'SIMULATED' : 'SUCCEEDED', key, simulated: op.status === 'SIMULATED', operationId: op.id, message: 'Ya ejecutada (idempotencia)' };
    }
    if (!op) {
      op = await this.prisma.externalOperation.create({
        data: { executionId: ctx.executionId, approvalItemId: item.id, kind: item.operationType, idempotencyKey, correlationId: ctx.correlationId, mode, target, payload: payload as object, payloadHash, status: 'PENDING' },
      });
    }

    if (mode === 'SIMULATED') {
      const n = (await this.prisma.externalOperation.count({ where: { executionId: ctx.executionId, status: 'SIMULATED' } })) + 1;
      const key = item.operationType === 'CREATE_ISSUE' ? `SIM-${ctx.executionNumber}-${n}` : String(payload.issueKey ?? '');
      await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: 'SIMULATED', attempts: { increment: 1 }, result: { key, simulated: true, note: 'Simulación: no se escribió en Jira' } } });
      if (key) ctx.created.set(item.itemKey, key);
      await this.audit(op, 'SIMULATED', `Simulado (no se escribió en Jira): ${item.title}`, ctx);
      return { ...base, status: 'SIMULATED', key, simulated: true, operationId: op.id, message: 'Simulación: no se escribió en Jira' };
    }

    // ---- LIVE ----
    if (op.status === 'IN_PROGRESS' || op.status === 'UNCERTAIN') {
      const reconciled = await this.reconcile(op, item, payload, ctx.gateway);
      if (reconciled) {
        await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: 'SUCCEEDED', result: { ...reconciled, reconciled: true } } });
        if (reconciled.key) ctx.created.set(item.itemKey, reconciled.key);
        await this.audit(op, 'SUCCEEDED', `Reconciliado contra Jira: ${item.title}`, ctx);
        return { ...base, status: 'SUCCEEDED', key: reconciled.key, operationId: op.id, message: 'Reconciliado: la operación ya estaba aplicada en Jira' };
      }
    }

    if (item.operationType === 'UPDATE_ISSUE' || item.operationType === 'TRANSITION_ISSUE') {
      const conflict = ctx.touched?.has(String(payload.issueKey)) ? null : await this.checkConflict(payload, ctx.gateway);
      if (conflict) {
        await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: 'BLOCKED', error: { code: 'VERSION_CONFLICT', message: 'La issue cambió en Jira durante la ejecución' } } });
        await this.audit(op, 'BLOCKED', `Conflicto de versión en ${String(payload.issueKey)}: escritura detenida`, ctx);
        return { ...base, status: 'CONFLICT', operationId: op.id, message: 'La issue cambió en Jira durante la ejecución: se detuvo la escritura y se pide nueva revisión', conflict: { current: conflict } };
      }
    }

    await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: 'IN_PROGRESS', attempts: { increment: 1 } } });
    try {
      let key: string | undefined;
      if (item.operationType === 'CREATE_ISSUE') {
        const r = await ctx.gateway.createIssue({
          projectKey: String(payload.projectKey),
          issueType: String(payload.issueType),
          summary: String(payload.summary),
          description: String(payload.description ?? ''),
          parentKey: payload.parentKey as string | undefined,
          labels: payload.labels as string[],
          fields: payload.fields as Record<string, unknown>,
        });
        key = r.key;
      } else if (item.operationType === 'UPDATE_ISSUE') {
        await ctx.gateway.updateIssue({ issueKey: String(payload.issueKey), summary: payload.summary as string | undefined, description: payload.description as string | undefined });
        key = String(payload.issueKey);
      } else if (item.operationType === 'TRANSITION_ISSUE') {
        await ctx.gateway.transitionIssue({ issueKey: String(payload.issueKey), transitionId: String(payload.transitionId), comment: String(payload.comment ?? '') });
        key = String(payload.issueKey);
      } else {
        await ctx.gateway.createIssueLink({ linkType: String(payload.linkType), inwardKey: String(payload.inwardKey), outwardKey: String(payload.outwardKey) });
      }
      await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: 'SUCCEEDED', result: { key } } });
      if (item.operationType === 'UPDATE_ISSUE' || item.operationType === 'TRANSITION_ISSUE') (ctx.touched ??= new Set()).add(String(payload.issueKey));
      if (key) ctx.created.set(item.itemKey, key);
      await this.audit(op, 'SUCCEEDED', `${item.operationType} en Jira: ${item.title}${key ? ` → ${key}` : ''}`, ctx);
      return { ...base, status: 'SUCCEEDED', key, operationId: op.id };
    } catch (err) {
      const e = toPlatformError(err);
      // Resultado incierto: puede haberse aplicado. Se reconcilia antes de repetir.
      const uncertain = ['TIMEOUT', 'MCP_DISCONNECTED', 'INTERNAL'].includes(e.code);
      await this.prisma.externalOperation.update({ where: { id: op.id }, data: { status: uncertain ? 'UNCERTAIN' : 'FAILED', error: e.toJSON() as object } });
      await this.audit(op, uncertain ? 'UNCERTAIN' : 'FAILED', `${item.operationType} falló: ${item.title} — ${e.code}`, ctx);
      if (isRetryable(e.code)) throw e;
      return { ...base, status: 'FAILED', operationId: op.id, message: `${e.code}: ${e.message}` };
    }
  }

  private async checkConflict(payload: Record<string, unknown>, gw: IJiraGateway) {
    const current = await gw.getIssue(String(payload.issueKey));
    const hash = issueVersionHash(current);
    const changed = (payload.baseUpdated && current.updated !== payload.baseUpdated) || (payload.baseHash && hash !== payload.baseHash);
    return changed ? { summary: current.summary, description: current.description, status: current.status, updated: current.updated } : null;
  }

  /** Verifica en Jira si una operación incierta ya se aplicó. */
  private async reconcile(op: ExternalOperation, item: ApprovalItem, payload: Record<string, unknown>, gw: IJiraGateway): Promise<{ key?: string } | null> {
    try {
      if (item.operationType === 'CREATE_ISSUE') {
        const label = (payload.labels as string[] | undefined)?.find((l) => l.startsWith('mao-'));
        if (!label) return null;
        const found = await gw.searchIssues(`labels = "${label}" AND summary ~ "${String(payload.summary).replace(/["\\]/g, ' ').slice(0, 80)}"`, 5);
        const hit = found.find((f) => f.summary === payload.summary);
        return hit ? { key: hit.key } : null;
      }
      if (item.operationType === 'UPDATE_ISSUE') {
        const cur = await gw.getIssue(String(payload.issueKey));
        const same = (payload.summary === undefined || cur.summary === payload.summary) && (payload.description === undefined || cur.description.trim() === String(payload.description).trim());
        return same ? { key: cur.key } : null;
      }
      if (item.operationType === 'TRANSITION_ISSUE') {
        // En proyectos con flujo simple la transición lleva el nombre del estado destino.
        const cur = await gw.getIssue(String(payload.issueKey));
        return payload.transitionName && cur.status.toLowerCase() === String(payload.transitionName).toLowerCase() ? { key: cur.key } : null;
      }
      if (item.operationType === 'CREATE_ISSUE_LINK') {
        // La issue bloqueada debe ver a la bloqueante como vínculo entrante ("is blocked by"); un vínculo invertido no cuenta.
        const cur = await gw.getIssue(String(payload.inwardKey));
        return cur.links.some((l) => l.issue.key === payload.outwardKey && l.direction === 'inward' && l.type.toLowerCase() === String(payload.linkType).toLowerCase()) ? {} : null;
      }
    } catch (err) {
      throw new PlatformError('JIRA_ERROR', `No se pudo reconciliar la operación ${op.id}: ${(err as Error).message}`);
    }
    return null;
  }

  private async audit(op: ExternalOperation, status: string, summary: string, ctx: PublicationContext) {
    await this.core.audit.record({
      actor: SYSTEM_ACTOR,
      action: `EXTERNAL_OPERATION_${status}`,
      entityType: 'ExternalOperation',
      entityId: op.id,
      executionId: ctx.executionId,
      projectId: ctx.projectId,
      summary,
      data: { kind: op.kind, target: op.target, mode: op.mode, idempotencyKey: op.idempotencyKey, correlationId: op.correlationId },
    });
  }
}
