import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { Core, seedDatabase } from '@mao/core';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app';
import { catalogDirLabel, syncCatalogFilesOnStartup } from '../src/routes/catalog-files';

const TOKEN = 't'.repeat(40);
let core: Core;
let app: FastifyInstance;

beforeAll(async () => {
  core = new Core({ ownerName: 'Propietario de prueba' });
  await seedDatabase(core);
  app = await buildApp(core, { ownerToken: TOKEN, allowedHosts: [], allowedOrigins: ['http://127.0.0.1:3000'] });
});

afterAll(async () => {
  await app.close();
  await core.close();
  await disconnectPrisma();
});

const auth = { authorization: `Bearer ${TOKEN}` };
const get = () => app.inject({ method: 'GET', url: '/api/catalog/files', headers: auth });
const post = (url: string, payload: unknown) => app.inject({ method: 'POST', url, headers: { ...auth, 'x-mao-channel': 'CLI' }, payload: payload as object });

// Forma mínima de cada reporte según los contratos de CatalogSyncService y ConfigFileService.
const expectCatalogReport = (r: any) => {
  expect(['agent', 'skill', 'orchestrator']).toContain(r.kind);
  expect(typeof r.key).toBe('string');
  expect(typeof r.relPath).toBe('string');
  expect(typeof r.state).toBe('string');
};
const expectConfigReport = (r: any) => {
  expect(['global', 'policies', 'connections', 'providers', 'project']).toContain(r.subject);
  expect(typeof r.relPath).toBe('string');
  expect(typeof r.state).toBe('string');
};

describe('archivos del catálogo por API', () => {
  it('exige el token del propietario', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/catalog/files' })).statusCode).toBe(401);
  });

  it('GET informa la carpeta (relativa al repo) y el estado de definiciones y configuración', async () => {
    const r = await get();
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.dir).not.toMatch(/^([A-Za-z]:|\/)/);
    expect(body.dir).not.toContain('\\');
    expect(path.resolve(core.deps.repoRoot, body.dir)).toBe(core.deps.catalogDir);
    expect(Array.isArray(body.catalog)).toBe(true);
    expect(Array.isArray(body.config)).toBe(true);
    body.catalog.forEach(expectCatalogReport);
    body.config.forEach(expectConfigReport);
    // global-setup copia las definiciones del repo a la carpeta de prueba.
    expect(body.catalog.find((x: any) => x.kind === 'agent' && x.key === 'MainSupervisor')?.relPath).toBe('agents/MainSupervisor.md');
  });

  it('si un servicio falla, ese bloque llega como { error } sin romper el otro', async () => {
    const spy = vi.spyOn(core.configFiles, 'status').mockRejectedValueOnce(new Error('disco no disponible'));
    try {
      const r = await get();
      expect(r.statusCode).toBe(200);
      expect(r.json().config).toEqual({ error: 'disco no disponible' });
      expect(typeof r.json().dir).toBe('string');
    } finally {
      spy.mockRestore();
    }
  });

  it('valida el pedido de sincronización', async () => {
    const overwriteSync = await post('/api/catalog/files/sync', { mode: 'sync', overwrite: true });
    expect(overwriteSync.statusCode).toBe(400);
    expect(overwriteSync.json().error.code).toBe('VALIDATION_ERROR');
    expect((await post('/api/catalog/files/sync', { mode: 'status' })).statusCode).toBe(400);
    expect((await post('/api/catalog/files/sync', {})).statusCode).toBe(400);
  });

  it('exportar y sincronizar devuelven el resultado del catálogo y de la configuración', async () => {
    const exported = await post('/api/catalog/files/sync', { mode: 'export' });
    expect(exported.statusCode).toBe(200);
    expect(Array.isArray(exported.json().catalog)).toBe(true);
    expect(Array.isArray(exported.json().config)).toBe(true);
    exported.json().catalog.forEach(expectCatalogReport);
    exported.json().config.forEach(expectConfigReport);

    const synced = await post('/api/catalog/files/sync', { mode: 'sync' });
    expect(synced.statusCode).toBe(200);
    expect(Array.isArray(synced.json().catalog)).toBe(true);
    expect(Array.isArray(synced.json().config)).toBe(true);
    // Después de exportar, nada queda sin escribir.
    expect(synced.json().catalog.filter((x: any) => ['MISSING_FILE', 'STALE_FILE'].includes(x.state))).toEqual([]);
  });

  it('el actor de la sincronización es el propietario con su canal', async () => {
    const spy = vi.spyOn(core.catalogSync, 'reconcile').mockResolvedValueOnce([]);
    const cfg = vi.spyOn(core.configFiles, 'export').mockResolvedValueOnce([]);
    try {
      const r = await post('/api/catalog/files/sync', { mode: 'export', overwrite: true });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual({ catalog: [], config: [] });
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER', channel: 'CLI' }), { mode: 'export', overwrite: true });
      expect(cfg).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER', channel: 'CLI' }), { overwrite: true });
    } finally {
      spy.mockRestore();
      cfg.mockRestore();
    }
  });

  it('aplicar la configuración exige confirm: true', async () => {
    for (const payload of [{}, { confirm: false }, { files: ['global.yaml'] }, { files: ['global.yaml'], confirm: 'true' }]) {
      const r = await post('/api/catalog/files/apply', payload);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('aplicar con confirmación devuelve los reportes de la configuración', async () => {
    const r = await post('/api/catalog/files/apply', { confirm: true });
    expect(r.statusCode).toBe(200);
    expect(Array.isArray(r.json())).toBe(true);
    r.json().forEach(expectConfigReport);
  });

  it('aplicar pasa la lista de archivos al servicio', async () => {
    const spy = vi.spyOn(core.configFiles, 'apply').mockResolvedValueOnce([{ subject: 'global', relPath: 'global.yaml', state: 'APPLIED' }]);
    try {
      const r = await post('/api/catalog/files/apply', { files: ['global.yaml'], confirm: true });
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([{ subject: 'global', relPath: 'global.yaml', state: 'APPLIED' }]);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'USER' }), ['global.yaml']);
    } finally {
      spy.mockRestore();
    }
  });
});

describe('sincronización de archivos al arrancar', () => {
  const capture = () => {
    const lines: string[] = [];
    const warns: string[] = [];
    return { lines, warns, log: { log: (m: string) => void lines.push(m), warn: (m: string) => void warns.push(m) } };
  };
  const report = (state: string, extra: Record<string, unknown> = {}) => ({ kind: 'agent', key: `K${Math.random()}`, relPath: 'agents/K.md', state, ...extra }) as any;

  it('resume el catálogo y la configuración en una línea cada uno', async () => {
    const rec = vi.spyOn(core.catalogSync, 'reconcile').mockResolvedValueOnce([...Array.from({ length: 17 }, () => report('IN_SYNC')), report('IMPORTED', { version: 2, approvalNumber: 12 })]);
    // Con catálogo instalado, la configuración se exporta (solo lo que falta o quedó viejo) y se resume.
    const st = vi.spyOn(core.configFiles, 'export').mockResolvedValueOnce([
      { subject: 'global', relPath: 'global.yaml', state: 'IN_SYNC' },
      { subject: 'policies', relPath: 'policies.yaml', state: 'EXPORTED' },
      { subject: 'project', key: 'SCRUM', relPath: 'projects/SCRUM.yaml', state: 'CHANGED' },
    ]);
    const c = capture();
    try {
      await syncCatalogFilesOnStartup(core, undefined, c.log);
      expect(rec).toHaveBeenCalledWith({ type: 'SYSTEM', id: 'sincronización de archivos' }, { mode: 'sync' });
      expect(c.lines).toEqual([
        `Catálogo (${catalogDirLabel(core)}): 17 al día, 1 importado como pendiente de aprobación (AP-12), 0 inválidos`,
        'Configuración: 1 al día, 1 exportado, 1 archivo con cambios sin aplicar (pnpm mao files apply)',
      ]);
      expect(st).toHaveBeenCalledWith({ type: 'SYSTEM', id: 'sincronización de archivos' });
      expect(c.warns).toEqual([]);
    } finally {
      rec.mockRestore();
      st.mockRestore();
    }
  });

  it('respeta export y off, y un error nunca impide arrancar', async () => {
    const rec = vi.spyOn(core.catalogSync, 'reconcile').mockRejectedValueOnce(new Error('carpeta ilegible'));
    const st = vi.spyOn(core.configFiles, 'export').mockRejectedValueOnce(new Error('yaml roto'));
    const c = capture();
    try {
      await expect(syncCatalogFilesOnStartup(core, 'export', c.log)).resolves.toBeUndefined();
      expect(rec).toHaveBeenCalledWith(expect.anything(), { mode: 'export' });
      expect(c.lines).toEqual([]);
      expect(c.warns).toHaveLength(2);
      expect(c.warns[0]).toContain('carpeta ilegible');
      expect(c.warns.every((w) => w.includes('La API arranca igual'))).toBe(true);

      const off = capture();
      await syncCatalogFilesOnStartup(core, 'off', off.log);
      expect(rec).toHaveBeenCalledTimes(1);
      expect(off.lines[0]).toContain('deshabilitada');
    } finally {
      rec.mockRestore();
      st.mockRestore();
    }
  });
});
