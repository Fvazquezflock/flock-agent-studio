import { OPERATION_TYPES, type OperationType, type PolicyUpsertRequest } from '@mao/shared';
import type { Core } from '../core';
import type { Actor } from '../context';
import { PlatformError, notFound } from '../util/errors';
import { checkPolicyChange, resolvePolicy, type PolicyRecord, type ResolvedPolicy } from './policy-engine';

export class PolicyService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  async listActive(): Promise<PolicyRecord[]> {
    const rows = await this.prisma.approvalPolicy.findMany({ where: { status: 'ACTIVE' }, orderBy: [{ operationType: 'asc' }, { version: 'desc' }] });
    return rows as unknown as PolicyRecord[];
  }

  async list(includeHistory = false) {
    return this.prisma.approvalPolicy.findMany({
      where: includeHistory ? {} : { status: 'ACTIVE' },
      include: { project: { select: { key: true, name: true } } },
      orderBy: [{ scope: 'asc' }, { operationType: 'asc' }, { version: 'desc' }],
    });
  }

  async resolve(operationType: OperationType, ctx: { projectId?: string | null; orchestratorKey?: string | null } = {}): Promise<ResolvedPolicy> {
    return resolvePolicy(await this.listActive(), operationType, ctx);
  }

  /** Matriz efectiva por operación para un proyecto (UI de configuración). */
  async effectiveMatrix(projectId?: string | null, orchestratorKey?: string | null) {
    const policies = await this.listActive();
    return OPERATION_TYPES.map((op) => resolvePolicy(policies, op, { projectId, orchestratorKey }));
  }

  /** Registra una nueva versión de política para el ámbito; la anterior queda INACTIVE. */
  async upsert(req: PolicyUpsertRequest, actor: Actor) {
    let projectId: string | null = null;
    if (req.scope === 'PROJECT') {
      if (!req.projectKey) throw new PlatformError('VALIDATION_ERROR', 'Las políticas de proyecto requieren projectKey');
      const project = await this.prisma.project.findUnique({ where: { key: req.projectKey } });
      if (!project) throw notFound(`Proyecto ${req.projectKey}`);
      projectId = project.id;
    }
    const existing = await this.listActive();
    const problem = checkPolicyChange(existing, { scope: req.scope, operationType: req.operationType, mode: req.mode, mandatory: req.mandatory });
    if (problem) throw new PlatformError('AUTHORIZATION_ERROR', problem);

    const orchestratorKey = req.orchestratorKey || null;
    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.approvalPolicy.findMany({ where: { scope: req.scope, projectId, orchestratorKey, operationType: req.operationType } });
      const version = prev.reduce((m, p) => Math.max(m, p.version), 0) + 1;
      await tx.approvalPolicy.updateMany({ where: { scope: req.scope, projectId, orchestratorKey, operationType: req.operationType, status: 'ACTIVE' }, data: { status: 'INACTIVE' } });
      const created = await tx.approvalPolicy.create({
        data: {
          scope: req.scope,
          projectId,
          orchestratorKey,
          operationType: req.operationType,
          mode: req.mode,
          mandatory: req.mandatory,
          rules: req.rules as object,
          description: req.description,
          version,
          createdBy: actor.id,
        },
      });
      await this.core.audit.record(
        {
          actor,
          action: 'POLICY_CHANGED',
          entityType: 'ApprovalPolicy',
          entityId: created.id,
          projectId,
          summary: `Política ${req.operationType} (${req.scope}${req.projectKey ? ' ' + req.projectKey : ''}${orchestratorKey ? ' / ' + orchestratorKey : ''}) → ${req.mode} v${version}`,
          data: { ...req, version },
        },
        tx,
      );
      return created;
    });
  }
}
