import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { connectionCreateRequest, connectionUpdateRequest } from '@mao/shared';
import { PlatformError, type Core } from '@mao/core';
import { actorOf, params, parse } from '../http';

/** Conexiones MCP, proveedores de IA, configuración global y exportación. */
export function registerIntegrationRoutes(app: FastifyInstance, core: Core) {
  app.get('/api/connections', async () => core.connections.list());
  /** Otra conexión Jira (otro sitio o cuenta) con el mismo servidor MCP: solo se registra la ruta del archivo de credenciales. */
  app.post('/api/connections', async (req, reply) => reply.code(201).send(await core.connections.create(parse(connectionCreateRequest, req.body), actorOf(core, req))));
  app.patch('/api/connections/:key', async (req) => core.connections.update(params(req).key, parse(connectionUpdateRequest, req.body), actorOf(core, req)));
  app.get('/api/connections/:key', async (req) => core.connections.get(params(req).key));
  app.post('/api/connections/:key/diagnose', async (req) => core.connections.diagnose(params(req).key, actorOf(core, req)));

  app.post('/api/connections/:key/test-read', async (req) => {
    const body = parse(z.object({ projectKey: z.string().optional(), issueKey: z.string().optional() }), req.body);
    return core.connections.testRead(params(req).key, body, actorOf(core, req));
  });

  /** Cambio de seguridad crítica: exige confirmación explícita escrita. */
  app.post('/api/connections/:key/write', async (req) => {
    const body = parse(z.object({ enabled: z.boolean(), confirm: z.string().optional() }), req.body);
    if (body.enabled && body.confirm !== 'HABILITAR ESCRITURA') throw new PlatformError('VALIDATION_ERROR', 'Para habilitar escrituras escribí exactamente "HABILITAR ESCRITURA".');
    return core.connections.setWriteEnabled(params(req).key, body.enabled, actorOf(core, req));
  });

  app.get('/api/providers', async () => core.providers.list());
  app.post('/api/providers/:key/diagnose', async (req) => {
    const body = parse(z.object({ deep: z.boolean().default(false) }), req.body);
    return core.providers.diagnose(params(req).key, body.deep, actorOf(core, req));
  });
  app.patch('/api/providers/:key', async (req) => {
    const body = parse(z.object({ enabled: z.boolean().optional(), isDefault: z.boolean().optional(), config: z.record(z.string(), z.unknown()).optional() }), req.body);
    return core.providers.update(params(req).key, body, actorOf(core, req));
  });

  app.get('/api/settings/global', async () => core.config.getGlobal());
  app.put('/api/settings/global', async (req) => {
    const body = parse(z.object({ config: z.record(z.string(), z.unknown()) }), req.body);
    return core.config.setGlobal(body.config, actorOf(core, req));
  });

  app.post('/api/export/claude-code', async (req) => core.exports.exportClaudeCode(actorOf(core, req)));
}
