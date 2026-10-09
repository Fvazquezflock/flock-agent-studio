import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { PlatformError, sanitize, toPlatformError, type Core } from '@mao/core';
import { registerApprovalRoutes } from './routes/approvals';
import { registerCatalogRoutes } from './routes/catalog';
import { registerExecutionRoutes } from './routes/executions';
import { registerGovernanceRoutes } from './routes/governance';
import { registerIntegrationRoutes } from './routes/integrations';
import { registerProjectRoutes } from './routes/projects';
import { registerSystemRoutes } from './routes/system';

export interface AppOptions {
  ownerToken: string;
  /** Hosts aceptados en el header Host (protección contra DNS rebinding). Vacío = cualquiera (solo pruebas). */
  allowedHosts: string[];
  /** Orígenes de navegador permitidos. La UI llama a la API desde su servidor (sin Origin). */
  allowedOrigins: string[];
  logger?: boolean;
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function buildApp(core: Core, opts: AppOptions): Promise<FastifyInstance> {
  if (!opts.ownerToken || opts.ownerToken.length < 24) throw new Error('MAO_OWNER_TOKEN no está configurado (mínimo 24 caracteres). Ejecutá scripts/setup.ps1.');
  const app = Fastify({ logger: opts.logger ? { level: 'info', redact: ['req.headers.authorization'] } : false, bodyLimit: 2 * 1024 * 1024 });

  // BigInt (ids de eventos/auditoría) se serializa como texto.
  app.setReplySerializer((payload) => JSON.stringify(payload, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));

  app.addHook('onRequest', async (req, reply) => {
    const host = String(req.headers.host ?? '');
    if (opts.allowedHosts.length && !opts.allowedHosts.includes(host)) {
      return reply.code(421).send({ error: { code: 'AUTHORIZATION_ERROR', message: 'Host no permitido' } });
    }
    const origin = req.headers.origin;
    if (origin && !opts.allowedOrigins.includes(origin)) {
      return reply.code(403).send({ error: { code: 'AUTHORIZATION_ERROR', message: 'Origen no permitido' } });
    }
    if (req.url.startsWith('/api/')) {
      const auth = String(req.headers.authorization ?? '');
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || !safeEqual(token, opts.ownerToken)) {
        return reply.code(401).send({ error: { code: 'AUTH_ERROR', message: 'Token del propietario inválido o ausente' } });
      }
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    const e = err instanceof PlatformError ? err : (err as { validation?: unknown }).validation ? new PlatformError('VALIDATION_ERROR', (err as Error).message) : toPlatformError(err);
    const status = e.code === 'INTERNAL' ? 500 : e.httpStatus;
    if (status >= 500) app.log?.error?.(err);
    return reply.code(status).send({ error: sanitize(e.toJSON()) });
  });

  app.get('/health', async () => ({ ok: true, service: 'mao-api', time: new Date().toISOString() }));

  registerSystemRoutes(app, core);
  registerProjectRoutes(app, core);
  registerCatalogRoutes(app, core);
  registerExecutionRoutes(app, core);
  registerApprovalRoutes(app, core);
  registerGovernanceRoutes(app, core);
  registerIntegrationRoutes(app, core);
  return app;
}
