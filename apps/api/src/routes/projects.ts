import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { backlogQuery, projectCreateRequest, projectUpdateRequest } from '@mao/shared';
import { PlatformError, type Core } from '@mao/core';
import { actorOf, params, parse } from '../http';

export function registerProjectRoutes(app: FastifyInstance, core: Core) {
  const prisma = core.deps.prisma;

  app.get('/api/projects', async () =>
    prisma.project.findMany({
      orderBy: { key: 'asc' },
      include: { connection: { select: { key: true, name: true, status: true } }, defaultProvider: { select: { key: true, name: true, kind: true } }, _count: { select: { executions: true } } },
    }),
  );

  app.post('/api/projects', async (req, reply) => {
    const body = parse(projectCreateRequest, req.body);
    return reply.code(201).send(await core.config.createProject(body, actorOf(core, req)));
  });

  app.get('/api/projects/:key', async (req) => {
    const { key } = params(req);
    const project = await prisma.project.findUnique({
      where: { key },
      include: { connection: true, defaultProvider: { select: { key: true, name: true, kind: true } }, configurations: { orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, changeNote: true, createdBy: true, createdAt: true, checksum: true } } },
    });
    if (!project) throw new PlatformError('NOT_FOUND', `Proyecto ${key} no encontrado`);
    const resolved = await core.config.resolvedForProject(project.id);
    const policies = await core.policies.effectiveMatrix(project.id);
    return { ...project, config: resolved.configRow.config, resolvedConfig: resolved.config, effectivePolicies: policies };
  });

  app.patch('/api/projects/:key', async (req) => {
    const { key } = params(req);
    const raw = (req.body ?? {}) as Record<string, unknown>;
    // El esquema parcial completa valores por defecto (mode DEMO, description ''): solo se cambian las claves enviadas.
    const parsed = parse(projectUpdateRequest, raw);
    const body = Object.fromEntries(Object.entries(parsed).filter(([k]) => raw[k] !== undefined)) as typeof parsed;
    return core.config.updateProject(key, body, actorOf(core, req));
  });

  app.put('/api/projects/:key/config', async (req) => {
    const { key } = params(req);
    const body = parse(z.object({ config: z.record(z.string(), z.unknown()), changeNote: z.string().max(2000).default('') }), req.body);
    return core.config.saveProjectConfig(key, body.config, body.changeNote, actorOf(core, req));
  });

  app.get('/api/projects/:key/config/:version', async (req) => {
    const { key, version } = params(req);
    const project = await prisma.project.findUnique({ where: { key } });
    if (!project) throw new PlatformError('NOT_FOUND', `Proyecto ${key} no encontrado`);
    const row = await prisma.projectConfiguration.findUnique({ where: { projectId_version: { projectId: project.id, version: Number(version) } } });
    if (!row) throw new PlatformError('NOT_FOUND', 'Versión inexistente');
    return row;
  });

  /** Backlog de Jira (solo lectura): épicas, historias de una épica o historias sin épica, para elegir qué analizar. */
  app.get('/api/projects/:key/backlog', async (req) => {
    const { key } = params(req);
    return core.backlog.list(key, parse(backlogQuery, req.query ?? {}));
  });

  /** Descubre tipos y campos con el conector. Con apply=true guarda una nueva versión de configuración con lo descubierto. */
  app.post('/api/projects/:key/discover', async (req) => {
    const { key } = params(req);
    const body = parse(z.object({ apply: z.boolean().default(false) }), req.body);
    const actor = actorOf(core, req);
    const discovery = await core.connections.discoverProject(key, actor);
    if (body.apply) {
      const project = await prisma.project.findUniqueOrThrow({ where: { key } });
      const current = await core.config.activeProjectConfig(project.id);
      const next = { ...(current.config as object), jira: { ...((current.config as { jira?: object }).jira ?? {}), discovered: { at: discovery.at, issueTypes: discovery.issueTypes, fields: discovery.fields, transitions: discovery.transitions, transitionsFrom: discovery.transitionsFrom } } };
      await core.config.saveProjectConfig(key, next, 'Descubrimiento de tipos y campos de Jira', actor);
    }
    return discovery;
  });
}
