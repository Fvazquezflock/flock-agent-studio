import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { TASK_TYPES, catalogCreateRequest, versionCreateRequest, type TaskType } from '@mao/shared';
import { PlatformError, type CatalogKind, type Core } from '@mao/core';
import { actorOf, params, parse, query } from '../http';

const KINDS: Record<string, CatalogKind> = { agents: 'agent', skills: 'skill', orchestrators: 'orchestrator' };

function kindOf(raw: string): CatalogKind {
  const k = KINDS[raw];
  if (!k) throw new PlatformError('NOT_FOUND', `Catálogo ${raw} inexistente`);
  return k;
}

const versionNumber = (v: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new PlatformError('VALIDATION_ERROR', 'Versión inválida');
  return n;
};

/** Agentes, skills y orquestadores comparten el mismo ciclo de vida versionado. */
export function registerCatalogRoutes(app: FastifyInstance, core: Core) {
  app.get('/api/:kind(agents|skills|orchestrators)', async (req) => core.catalog.list(kindOf(params(req).kind)));

  app.post('/api/:kind(agents|skills|orchestrators)/validate', async (req) => {
    const body = parse(z.object({ definition: z.record(z.string(), z.unknown()), key: z.string().optional() }), req.body);
    return core.catalog.validate(kindOf(params(req).kind), body.definition, body.key);
  });

  app.post('/api/:kind(agents|skills|orchestrators)', async (req, reply) => {
    const body = parse(catalogCreateRequest, req.body);
    const r = await core.catalog.create(kindOf(params(req).kind), body.key, body.definition, body.changeNote, actorOf(core, req));
    return reply.code(201).send(r);
  });

  app.get('/api/:kind(agents|skills|orchestrators)/:key', async (req) => {
    const { kind, key } = params(req);
    return core.catalog.get(kindOf(kind), key);
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/versions', async (req, reply) => {
    const { kind, key } = params(req);
    const body = parse(versionCreateRequest, req.body);
    return reply.code(201).send(await core.catalog.createVersion(kindOf(kind), key, body.definition, body.changeNote, actorOf(core, req)));
  });

  app.put('/api/:kind(agents|skills|orchestrators)/:key/versions/:version', async (req) => {
    const { kind, key, version } = params(req);
    const body = parse(versionCreateRequest, req.body);
    return core.catalog.updateDraft(kindOf(kind), key, versionNumber(version), body.definition, body.changeNote, actorOf(core, req));
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/versions/:version/activate', async (req, reply) => {
    const { kind, key, version } = params(req);
    return reply.code(202).send(await core.catalog.requestActivation(kindOf(kind), key, versionNumber(version), actorOf(core, req)));
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/versions/:version/archive', async (req) => {
    const { kind, key, version } = params(req);
    await core.catalog.archiveVersion(kindOf(kind), key, versionNumber(version), actorOf(core, req));
    return { ok: true };
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/versions/:version/restore', async (req, reply) => {
    const { kind, key, version } = params(req);
    return reply.code(201).send(await core.catalog.restore(kindOf(kind), key, versionNumber(version), actorOf(core, req)));
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/versions/:version/test', async (req) => {
    const { kind, key, version } = params(req);
    const body = parse(z.object({ providerKey: z.string().optional(), task: z.enum(TASK_TYPES as [TaskType, ...TaskType[]]).optional() }), req.body);
    return core.catalogTests.test(kindOf(kind), key, versionNumber(version), body);
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/deactivate', async (req) => {
    const { kind, key } = params(req);
    return core.catalog.deactivate(kindOf(kind), key, actorOf(core, req));
  });

  app.post('/api/:kind(agents|skills|orchestrators)/:key/duplicate', async (req, reply) => {
    const { kind, key } = params(req);
    const body = parse(z.object({ newKey: catalogCreateRequest.shape.key }), req.body);
    return reply.code(201).send(await core.catalog.duplicate(kindOf(kind), key, body.newKey, actorOf(core, req)));
  });

  app.get('/api/:kind(agents|skills|orchestrators)/:key/diff', async (req) => {
    const { kind, key } = params(req);
    const q = query(req);
    return core.catalog.diff(kindOf(kind), key, versionNumber(q.from ?? '1'), versionNumber(q.to ?? '1'));
  });
}
