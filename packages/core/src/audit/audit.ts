import type { Prisma } from '@mao/db';
import type { Actor, CoreDeps } from '../context';
import { sanitize } from '../util/sanitize';

export interface AuditInput {
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  projectId?: string | null;
  executionId?: string | null;
  data?: unknown;
}

/** Registro de auditoría inmutable (solo inserciones). Los datos se sanitizan siempre. */
export class AuditService {
  constructor(private readonly deps: CoreDeps) {}

  async record(input: AuditInput, tx?: Prisma.TransactionClient): Promise<void> {
    const db = tx ?? this.deps.prisma;
    await db.auditEvent.create({
      data: {
        actorType: input.actor.type,
        actorId: input.actor.channel ? `${input.actor.id} (${input.actor.channel})` : input.actor.id,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        summary: input.summary,
        projectId: input.projectId ?? null,
        executionId: input.executionId ?? null,
        data: input.data === undefined ? undefined : (sanitize(input.data) as Prisma.InputJsonValue),
      },
    });
  }

  async list(filters: { entityType?: string; entityId?: string; executionId?: string; projectId?: string; action?: string; actorType?: string; q?: string; limit?: number; before?: bigint }) {
    const where: Prisma.AuditEventWhereInput = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.executionId) where.executionId = filters.executionId;
    if (filters.projectId) where.projectId = filters.projectId;
    if (filters.action) where.action = { contains: filters.action };
    if (filters.actorType) where.actorType = filters.actorType as Prisma.EnumActorTypeFilter['equals'];
    if (filters.q) where.summary = { contains: filters.q, mode: 'insensitive' };
    if (filters.before) where.id = { lt: filters.before };
    return this.deps.prisma.auditEvent.findMany({ where, orderBy: { id: 'desc' }, take: Math.min(filters.limit ?? 100, 500) });
  }
}
