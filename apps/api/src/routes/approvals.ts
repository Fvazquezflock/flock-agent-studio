import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { approvalDecisionRequest, approvalItemEditRequest, regenerateRequest } from '@mao/shared';
import type { Core } from '@mao/core';
import { actorOf, channelOf, params, parse, query } from '../http';

export function registerApprovalRoutes(app: FastifyInstance, core: Core) {
  app.get('/api/approvals', async (req) => {
    const q = query(req);
    return core.approvals.list({ status: q.status, executionId: q.execution, kind: q.kind, limit: q.limit ? Number(q.limit) : undefined });
  });

  app.get('/api/approvals/:id', async (req) => core.approvals.get(params(req).id));

  app.patch('/api/approvals/:id/items/:itemId', async (req) => {
    const { id, itemId } = params(req);
    const body = parse(approvalItemEditRequest, req.body);
    return core.approvals.editItem(id, itemId, body.payload, body.note, actorOf(core, req));
  });

  app.post('/api/approvals/:id/decisions', async (req) => {
    const body = parse(approvalDecisionRequest, req.body);
    // El canal de la decisión es el del cliente autenticado, no el declarado en el cuerpo.
    return core.approvals.decide(params(req).id, { ...body, channel: channelOf(req) }, actorOf(core, req));
  });

  app.post('/api/approvals/:id/regenerate', async (req) => {
    const body = parse(regenerateRequest, req.body);
    return core.approvals.regenerate(params(req).id, body.feedback, channelOf(req), actorOf(core, req));
  });

  app.post('/api/approvals/:id/close', async (req) => {
    const body = parse(z.object({ comment: z.string().max(2000).default('') }), req.body);
    return core.approvals.close(params(req).id, body.comment, channelOf(req), actorOf(core, req));
  });
}
