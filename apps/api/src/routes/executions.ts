import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createExecutionRequest } from '@mao/shared';
import type { Core } from '@mao/core';
import { actorOf, channelOf, params, parse, query } from '../http';

const POLL_MS = 700;
const HEARTBEAT_MS = 15_000;

function lastEventId(req: FastifyRequest): bigint {
  const raw = String(req.headers['last-event-id'] ?? query(req).after ?? '0');
  try {
    return BigInt(/^\d+$/.test(raw) ? raw : '0');
  } catch {
    return 0n;
  }
}

/**
 * SSE con recuperación: cada evento lleva su id; al reconectar, el navegador envía Last-Event-ID
 * y se reenvía todo lo posterior desde PostgreSQL (los eventos son persistentes).
 */
async function stream(core: Core, req: FastifyRequest, reply: FastifyReply, executionId: string | null) {
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  let last = lastEventId(req);
  let lastStatus = '';
  let closed = false;
  let busy = false;
  const tick = async () => {
    if (closed || busy) return;
    busy = true;
    try {
      const events = await core.engine.events(executionId, last, 200);
      for (const e of events) {
        last = e.id;
        res.write(`id: ${e.id}\nevent: ${e.type}\ndata: ${JSON.stringify({ ...e, id: e.id.toString() })}\n\n`);
      }
      if (executionId) {
        const ex = await core.deps.prisma.execution.findUnique({ where: { id: executionId }, select: { status: true, currentStepKey: true } });
        const status = `${ex?.status}|${ex?.currentStepKey}`;
        if (status !== lastStatus) {
          lastStatus = status;
          res.write(`event: status\ndata: ${JSON.stringify(ex)}\n\n`);
        }
      }
    } catch {
      /* el próximo ciclo reintenta */
    } finally {
      busy = false;
    }
  };
  const poll = setInterval(tick, POLL_MS);
  const ping = setInterval(() => !closed && res.write(': ping\n\n'), HEARTBEAT_MS);
  req.raw.on('close', () => {
    closed = true;
    clearInterval(poll);
    clearInterval(ping);
  });
  await tick();
}

export function registerExecutionRoutes(app: FastifyInstance, core: Core) {
  app.get('/api/executions', async (req) => {
    const q = query(req);
    return core.engine.list({ status: q.status, projectKey: q.project, source: q.source, orchestratorKey: q.orchestrator, limit: q.limit ? Number(q.limit) : undefined });
  });

  app.post('/api/executions', async (req, reply) => {
    const body = parse(createExecutionRequest, req.body);
    // El canal lo determina quién llama (CLI, UI o Claude Code), no el cuerpo.
    const channel = channelOf(req);
    const source = body.source === 'API' && channel !== 'API' ? channel : body.source;
    const ex = await core.engine.createExecution({ ...body, source }, actorOf(core, req));
    return reply.code(201).send(await core.engine.get(ex.id));
  });

  app.get('/api/executions/:id', async (req) => core.engine.get(params(req).id));

  /** Consumo de tokens de la ejecución (todas las invocaciones, incluidos reintentos y respuestas fuera de contrato). */
  app.get('/api/executions/:id/usage', async (req) => core.usage.forExecution(params(req).id));

  app.get('/api/executions/:id/events', async (req) => {
    const ex = await core.engine.get(params(req).id);
    return core.engine.events(ex.id, lastEventId(req), Number(query(req).limit ?? 500));
  });

  app.get('/api/executions/:id/stream', async (req, reply) => {
    const ex = await core.engine.get(params(req).id);
    await stream(core, req, reply, ex.id);
  });

  app.get('/api/events/stream', async (req, reply) => {
    await stream(core, req, reply, null);
  });

  app.post('/api/executions/:id/cancel', async (req) => core.engine.cancel(params(req).id, actorOf(core, req)));
  app.post('/api/executions/:id/retry', async (req) => core.engine.retry(params(req).id, actorOf(core, req)));
}
