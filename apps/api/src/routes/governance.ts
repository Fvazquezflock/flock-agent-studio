import type { FastifyInstance } from 'fastify';
import { policyUpsertRequest, proposalDecisionRequest, proposalEditRequest, proposalImplementRequest } from '@mao/shared';
import { PlatformError, type Core } from '@mao/core';
import { actorOf, channelOf, params, parse, query } from '../http';

/** Políticas, propuestas de capacidades y auditoría. */
export function registerGovernanceRoutes(app: FastifyInstance, core: Core) {
  const prisma = core.deps.prisma;

  app.get('/api/policies', async (req) => core.policies.list(query(req).history === '1'));

  app.post('/api/policies', async (req, reply) => {
    const body = parse(policyUpsertRequest, req.body);
    return reply.code(201).send(await core.policies.upsert(body, actorOf(core, req)));
  });

  app.get('/api/policies/effective', async (req) => {
    const q = query(req);
    let projectId: string | null = null;
    if (q.projectKey) {
      const p = await prisma.project.findUnique({ where: { key: q.projectKey } });
      if (!p) throw new PlatformError('NOT_FOUND', `Proyecto ${q.projectKey} no encontrado`);
      projectId = p.id;
    }
    return core.policies.effectiveMatrix(projectId, q.orchestratorKey ?? null);
  });

  app.get('/api/proposals', async (req) => core.proposals.list(query(req).status));
  app.get('/api/proposals/:id', async (req) => core.proposals.detail(params(req).id));
  /** Confirma el plan de implementación revisado (hash) y registra la aprobación individual de cada paso. */
  app.post('/api/proposals/:id/implement', async (req) => {
    const body = parse(proposalImplementRequest, req.body);
    return core.proposals.implement(params(req).id, { confirmHash: body.confirmHash, comment: body.comment, channel: channelOf(req) }, actorOf(core, req));
  });
  /** Regenera la definición de un borrador con CapabilityDesigner (puede consumir tokens del modelo real). */
  app.post('/api/proposals/:id/redesign', async (req) => core.proposals.redesign(params(req).id, actorOf(core, req)));
  app.patch('/api/proposals/:id', async (req) => core.proposals.edit(params(req).id, parse(proposalEditRequest, req.body), actorOf(core, req)));
  app.post('/api/proposals/:id/submit', async (req, reply) => reply.code(202).send(await core.proposals.submit(params(req).id, actorOf(core, req))));
  app.post('/api/proposals/:id/discard', async (req) => {
    const body = parse(proposalDecisionRequest, req.body);
    await core.proposals.discard(params(req).id, body.comment, actorOf(core, req));
    return { ok: true };
  });
  app.post('/api/proposals/:id/test', async (req) => core.proposals.test(params(req).id));
  app.get('/api/proposals/:id/diff', async (req) => {
    const q = query(req);
    return core.proposals.diff(params(req).id, Number(q.from ?? 1), Number(q.to ?? 1));
  });

  app.get('/api/audit', async (req) => {
    const q = query(req);
    let projectId: string | undefined;
    if (q.projectKey) projectId = (await prisma.project.findUnique({ where: { key: q.projectKey } }))?.id ?? '__none__';
    let executionId = q.executionId;
    if (executionId && /^(EX-)?\d+$/i.test(executionId)) executionId = (await core.engine.get(executionId)).id;
    return core.audit.list({
      entityType: q.entityType,
      entityId: q.entityId,
      executionId,
      projectId,
      action: q.action,
      actorType: q.actorType,
      q: q.q,
      limit: q.limit ? Number(q.limit) : 100,
      before: q.before && /^\d+$/.test(q.before) ? BigInt(q.before) : undefined,
    });
  });
}
