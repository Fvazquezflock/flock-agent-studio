import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { describeDatabaseUrl, supervisorRequest } from '@mao/shared';
import type { Core } from '@mao/core';
import { actorOf, channelOf, parse } from '../http';

export function registerSystemRoutes(app: FastifyInstance, core: Core) {
  const prisma = core.deps.prisma;

  app.get('/api/status', async () => {
    let db = 'Disponible';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'Error';
    }
    const workers = await prisma.workerHeartbeat.findMany({ orderBy: { seenAt: 'desc' }, take: 5 });
    const alive = workers.filter((w) => Date.now() - w.seenAt.getTime() < 30_000);
    const [connections, providers] = await Promise.all([
      prisma.connection.findMany({ select: { key: true, name: true, status: true, lastCheckedAt: true, writeEnabled: true, lastError: true } }),
      prisma.modelProviderConfiguration.findMany({ select: { key: true, name: true, kind: true, status: true, enabled: true, isDefault: true, lastCheckedAt: true } }),
    ]);
    const target = describeDatabaseUrl(process.env.DATABASE_URL);
    return {
      api: 'Disponible',
      db,
      // Solo host, puerto y base: nunca usuario ni contraseña.
      dbTarget: target && { host: target.host, port: target.port, database: target.database, remote: target.remote, tls: ['require', 'verify-ca', 'verify-full'].includes(target.sslmode ?? '') },
      worker: alive.length ? 'Disponible' : 'No detectado',
      workers: workers.map((w) => ({ ...w, alive: alive.includes(w) })),
      connections,
      providers,
      owner: core.deps.ownerName,
      jiraWritesAllowed: core.deps.allowJiraWrites,
      version: '0.1.0',
    };
  });

  app.get('/api/dashboard', async () => {
    const [projects, agents, orchestrators, active, completed, failed, waiting, pendingApprovals, proposals, recent, activity] = await Promise.all([
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.agent.count({ where: { status: 'ACTIVE' } }),
      prisma.orchestrator.count({ where: { status: 'ACTIVE' } }),
      prisma.execution.count({ where: { status: { in: ['PENDING', 'RUNNING', 'RETRYING', 'WAITING_APPROVAL'] } } }),
      prisma.execution.count({ where: { status: 'COMPLETED' } }),
      prisma.execution.count({ where: { status: 'FAILED' } }),
      prisma.execution.count({ where: { status: 'WAITING_APPROVAL' } }),
      prisma.approvalRequest.count({ where: { status: { in: ['PENDING', 'PARTIALLY_DECIDED'] } } }),
      prisma.capabilityProposal.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } } }),
      core.engine.list({ limit: 8 }),
      prisma.auditEvent.findMany({ orderBy: { id: 'desc' }, take: 15 }),
    ]);
    const errors = await prisma.executionEvent.findMany({ where: { level: 'error' }, orderBy: { id: 'desc' }, take: 5, include: { execution: { select: { number: true } } } });
    return { counts: { projects, agents, orchestrators, active, completed, failed, waiting, pendingApprovals, proposals }, recent, activity, errors };
  });

  /** Consumo de tokens de los modelos en los últimos días (por agente, origen, proveedor y ejecuciones con más consumo). */
  app.get('/api/usage', async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30), project: z.string().optional() }), req.query ?? {});
    return core.usage.summary({ days: q.days, projectKey: q.project });
  });

  app.get('/api/catalog/metadata', async () => core.supervisor.catalogMetadata());

  app.post('/api/supervisor/plan', async (req) => {
    const body = parse(supervisorRequest, req.body);
    return core.supervisor.plan(body.text, { projectKey: body.projectKey, providerKey: body.providerKey });
  });

  app.post('/api/supervisor/run', async (req, reply) => {
    const body = parse(supervisorRequest, req.body);
    const source = body.source === 'API' ? channelOf(req) : body.source;
    const r = await core.supervisor.run(body.text, { projectKey: body.projectKey, providerKey: body.providerKey, source }, actorOf(core, req));
    return reply.code(r.execution ? 201 : 200).send(r);
  });
}
