import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { Core, seedDatabase } from '@mao/core';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';

const TOKEN = 't'.repeat(40);
let core: Core;
let app: FastifyInstance;
let base: string;

beforeAll(async () => {
  core = new Core({ ownerName: 'Propietario de prueba' });
  await seedDatabase(core);
  app = await buildApp(core, { ownerToken: TOKEN, allowedHosts: [], allowedOrigins: ['http://127.0.0.1:3000'] });
  await app.listen({ host: '127.0.0.1', port: 0 });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  process.env.MAO_API_URL = base;
  process.env.MAO_OWNER_TOKEN = TOKEN;
});

afterAll(async () => {
  await app.close();
  await core.close();
  await disconnectPrisma();
});

const auth = { authorization: `Bearer ${TOKEN}` };

describe('seguridad de la API local', () => {
  it('exige el token del propietario', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/projects' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/projects', headers: { authorization: 'Bearer otro' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/projects', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
  });

  it('bloquea orígenes de navegador no permitidos (CSRF) y hosts ajenos (DNS rebinding)', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/executions', headers: { ...auth, origin: 'https://evil.example' }, payload: {} })).statusCode).toBe(403);
    const strict = await buildApp(core, { ownerToken: TOKEN, allowedHosts: ['127.0.0.1:4317'], allowedOrigins: [] });
    expect((await strict.inject({ method: 'GET', url: '/api/projects', headers: { ...auth, host: 'evil.example' } })).statusCode).toBe(421);
    await strict.close();
  });

  it('valida entradas y devuelve errores tipados', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/executions', headers: auth, payload: { projectKey: '' } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('consistencia CLI ↔ API ↔ UI', () => {
  it('una ejecución creada con el cliente de la CLI es la misma que ve la API (y la UI)', async () => {
    process.env.MAO_SOURCE = 'CLI';
    const prevClaude = process.env.CLAUDECODE;
    delete process.env.CLAUDECODE;
    const { ApiClient } = await import('../../cli/src/client');
    const cli = new ApiClient();
    expect(cli.base).toBe(base);
    expect(cli.channel).toBe('CLI');
    const created = await cli.post('/api/executions', { projectKey: 'DEMO', orchestratorKey: 'STORY_REVIEW_AND_DECOMPOSITION', input: { storyKey: 'DEMO-102' }, source: cli.channel });
    expect(created.source).toBe('CLI');

    // La UI usa la misma API (vía su proxy, canal UI): ve exactamente la misma ejecución.
    const fromUi = await app.inject({ method: 'GET', url: `/api/executions/${created.id}`, headers: { ...auth, 'x-mao-channel': 'UI' } });
    expect(fromUi.json().id).toBe(created.id);
    expect(fromUi.json().source).toBe('CLI');
    const list = await app.inject({ method: 'GET', url: '/api/executions?limit=50', headers: auth });
    expect(list.json().some((e: any) => e.id === created.id)).toBe(true);

    // El worker procesa; la CLI consulta estado y aprobaciones por la API.
    await core.engine.runUntilIdle('api-test');
    const status = await cli.get(`/api/executions/${created.number}`);
    expect(status.status).toBe('WAITING_APPROVAL');
    const approvals = await cli.get('/api/approvals?status=OPEN');
    const mine = approvals.find((a: any) => a.executionId === created.id);
    expect(mine).toBeTruthy();

    // La decisión desde la CLI queda registrada con su canal.
    const detail = await cli.get(`/api/approvals/${mine.id}`);
    const batch = detail.items.filter((i: any) => i.policyMode === 'BATCH_APPROVAL').map((i: any) => i.id);
    const dec = await cli.post(`/api/approvals/${mine.id}/decisions`, { approve: batch, reject: [], comment: 'desde CLI', confirmHash: detail.decisionHash.slice(0, 12) });
    expect(dec.decision.channel).toBe('CLI');

    // Eventos persistidos disponibles por SSE para la UI y por la CLI.
    const events: string[] = [];
    await cli.stream(`/api/executions/${created.id}/stream`, (type) => {
      events.push(type);
      return events.length >= 3;
    });
    expect(events).toContain('EXECUTION_CREATED');
    if (prevClaude !== undefined) process.env.CLAUDECODE = prevClaude;
  });

  it('el supervisor planifica desde lenguaje natural vía API', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/supervisor/plan', headers: auth, payload: { text: 'Validá la HU DEMO-102 y generá las tareas que falten' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().orchestratorKey).toBe('STORY_REVIEW_AND_DECOMPOSITION');
    expect(r.json().input.storyKey).toBe('DEMO-102');
  });
});

describe('backlog de Jira (solo lectura)', () => {
  const get = async (qs: string) => app.inject({ method: 'GET', url: `/api/projects/DEMO/backlog${qs}`, headers: auth });

  it('lista las épicas y las historias de una épica con los tipos mapeados', async () => {
    const epics = (await get('')).json();
    expect(epics).toMatchObject({ projectKey: 'DEMO', mode: 'DEMO', kind: 'epic', issueType: 'Epic', hasMore: false });
    expect(epics.items.map((i: any) => i.key)).toEqual(['DEMO-100']);

    const stories = (await get('?kind=story&parent=DEMO-100')).json();
    expect(stories.issueType).toBe('Story');
    // Solo historias: las subtareas de la épica no aparecen.
    expect(stories.items.map((i: any) => i.key).sort()).toEqual(['DEMO-101', 'DEMO-102', 'DEMO-103']);
    expect(stories.items.every((i: any) => i.parentKey === 'DEMO-100')).toBe(true);
  });

  it('historias sin épica, búsqueda por clave y validación de la entrada', async () => {
    expect((await get('?kind=story&withoutParent=1')).json().items).toEqual([]);
    expect((await get('?kind=story&q=DEMO-102')).json().items.map((i: any) => i.key)).toEqual(['DEMO-102']);
    const bad = await get('?kind=story&parent=DEMO-100%20OR%201%3D1');
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    expect((await app.inject({ method: 'GET', url: '/api/projects/NOPE/backlog', headers: auth })).statusCode).toBe(404);
  });
});
