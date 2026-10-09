import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { disconnectPrisma } from '@mao/db';
import { CATALOG_KINDS, Core, seedDatabase, type CatalogFileReport, type CatalogKind } from '../../src/index';
import { actor, approveAll, testCore } from './helpers';

// Core propio sobre una copia temporal del catálogo de prueba: lo que escriben estas pruebas no afecta a las demás.
const base = await testCore();
const dir = mkdtempSync(path.join(os.tmpdir(), 'mao-catalog-'));
cpSync(base.deps.catalogDir, dir, { recursive: true });
const core = new Core({ ownerName: 'Propietario de prueba', catalogDir: dir });
const files = core.catalogFiles;
const prisma = core.deps.prisma;
const a = actor(core);

afterAll(async () => {
  await core.close();
  await base.close();
  await disconnectPrisma();
  rmSync(dir, { recursive: true, force: true });
});

// Claves únicas: la base de prueba es compartida por todos los archivos de la corrida.
const AG = 'AgenteArchivos';
const SK = 'SkillArchivoNueva';

const statusOf = async (kind: CatalogKind, key: string) => {
  const [r] = await core.catalogSync.reconcile(a, { mode: 'status', kinds: [kind], keys: [key] });
  return r;
};
const find = (reports: CatalogFileReport[], kind: CatalogKind, key: string) => reports.find((r) => r.kind === kind && r.key === key);

async function reject(requestId: string) {
  const full = await core.approvals.get(requestId);
  await core.approvals.decide(requestId, { approve: [], reject: full.items.map((i) => i.id), comment: 'no', channel: 'UI', confirmHash: full.decisionHash.slice(0, 12) }, a);
}

describe('catálogo en archivos (catalog/) sincronizado con la base', () => {
  it('estado inicial: los archivos del catálogo de prueba coinciden con las versiones activas', async () => {
    // Catálogo base fijo (test/fixtures/catalog) copiado por global-setup; el catálogo del repo lo validan las unitarias.
    const keys = CATALOG_KINDS.flatMap((kind) => files.list(kind).map((e) => [kind, e.key] as const));
    expect(keys.length).toBeGreaterThan(10);
    const reports = await core.catalogSync.status();
    for (const [kind, key] of keys) expect(find(reports, kind, key)?.state, `${kind} ${key}`).toBe('IN_SYNC');
  });

  it('la carga inicial sobre una base ya sembrada es idempotente', async () => {
    const counts = () => Promise.all([prisma.agentVersion.count(), prisma.skillVersion.count(), prisma.orchestratorVersion.count(), prisma.approvalRequest.count({ where: { kind: 'activation' } })]);
    const before = await counts();
    const logs: string[] = [];
    await seedDatabase(core, (m) => logs.push(m));
    expect(await counts()).toEqual(before);
    // Con catálogo en la base, el seed solo informa el estado de los archivos (no importa nada).
    expect(logs.some((l) => l.startsWith('Catálogo frente a'))).toBe(true);
    expect(logs.join('\n')).not.toMatch(/importado/);
  });

  it('activar por el flujo normal escribe el archivo (hook de aprobaciones)', async () => {
    await core.catalog.create('agent', AG, { name: 'Agente de archivos', systemPrompt: 'Revisás archivos del catálogo.', tasks: ['story_review'], skills: ['UserStoryWriting'] }, 'Inicial', a);
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'INACTIVE' });
    const req = await core.catalog.requestActivation('agent', AG, 1, a);
    expect(files.readText(`agents/${AG}.md`)).toBeNull();
    await approveAll(core, req.id);
    expect(files.readText(`agents/${AG}.md`)).toContain('Revisás archivos del catálogo.');
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'IN_SYNC', version: 1 });
    expect(await core.audit.list({ action: 'CATALOG_FILE_EXPORTED', entityId: AG })).toHaveLength(1);
  });

  it('editar el archivo: CHANGED → sync crea una versión pendiente sin tocar la activa → aprobarla deja el archivo IN_SYNC', async () => {
    const rel = `agents/${AG}.md`;
    files.writeText(rel, files.readText(rel)!.replace('Revisás archivos del catálogo.', 'Revisás archivos del catálogo con cuidado.'));
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'CHANGED', version: 1 });

    const [imp] = await core.catalogSync.reconcile(a, { mode: 'sync', keys: [AG] });
    expect(imp).toMatchObject({ state: 'IMPORTED', version: 2 });
    expect(imp.approvalNumber).toBeGreaterThan(0);
    const entity = await core.catalog.get('agent', AG);
    expect(entity.activeVersion?.version).toBe(1);
    expect(entity.versions.find((v) => v.version === 2)).toMatchObject({ status: 'PENDING_APPROVAL', changeNote: `Importado desde catalog/${rel}` });
    expect(await core.approvals.get(imp.approvalRequestId!)).toMatchObject({ kind: 'activation', status: 'PENDING', number: imp.approvalNumber });

    // Volver a sincronizar no duplica: informa la solicitud vigente.
    const [again] = await core.catalogSync.reconcile(a, { mode: 'sync', keys: [AG] });
    expect(again).toMatchObject({ state: 'PENDING_APPROVAL', version: 2, approvalRequestId: imp.approvalRequestId, approvalNumber: imp.approvalNumber });

    await approveAll(core, imp.approvalRequestId!);
    expect((await core.catalog.get('agent', AG)).activeVersion?.version).toBe(2);
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'IN_SYNC', version: 2 });
    expect(files.readText(rel)).toContain('con cuidado');
    expect(await core.audit.list({ action: 'CATALOG_FILE_IMPORTED', entityId: AG })).toHaveLength(1);
  });

  it('rechazar una importación: el hook vuelve el archivo a la activa; con la versión rechazada queda STALE_FILE y export lo reescribe', async () => {
    const rel = `agents/${AG}.md`;
    const edited = files.readText(rel)!.replace('con cuidado', 'sin apuro');
    files.writeText(rel, edited);
    const [imp] = await core.catalogSync.reconcile(a, { mode: 'sync', keys: [AG] });
    expect(imp).toMatchObject({ state: 'IMPORTED', version: 3 });
    await reject(imp.approvalRequestId!);
    expect((await core.catalog.get('agent', AG)).versions.find((v) => v.version === 3)?.status).toBe('REJECTED');
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'IN_SYNC', version: 2 });

    // El archivo vuelve a tener la versión rechazada (p. ej. un git pull): STALE_FILE, no se reimporta.
    files.writeText(rel, edited);
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'STALE_FILE', version: 3 });
    const [exp] = await core.catalogSync.reconcile(a, { mode: 'export', keys: [AG] });
    expect(exp).toMatchObject({ state: 'EXPORTED', version: 2 });
    expect(files.readText(rel)).toContain('con cuidado');
    expect((await core.catalog.get('agent', AG)).versions).toHaveLength(3);
  });

  it('export no pisa cambios sin importar; con sobrescribir reemplaza CHANGED e INVALID de entidades existentes', async () => {
    const rel = `agents/${AG}.md`;
    const good = files.readText(rel)!;
    for (const [text, state] of [
      [good.replace('con cuidado', 'editado a mano'), 'CHANGED'],
      ['---\nname: roto\n', 'INVALID'],
    ] as const) {
      files.writeText(rel, text);
      const [plain] = await core.catalogSync.reconcile(a, { mode: 'export', keys: [AG] });
      expect(plain.state).toBe(state);
      expect(files.readText(rel)).toBe(text);
      const [forced] = await core.catalogSync.reconcile(a, { mode: 'export', keys: [AG], overwrite: true });
      expect(forced).toMatchObject({ state: 'EXPORTED', version: 2 });
      expect(await statusOf('agent', AG)).toMatchObject({ state: 'IN_SYNC', version: 2 });
    }
  });

  it('skill nueva en un archivo: NEW → sync crea v1 pendiente (nunca activa); rechazada, se borra el archivo', async () => {
    const rel = `skills/${SK}/SKILL.md`;
    files.writeText(rel, '---\nname: Skill desde archivo\ndescription: Creada a mano en catalog/.\nrules:\n  - Una regla\n---\n\n# Skill desde archivo\n\nInstrucciones.\n');
    expect(await statusOf('skill', SK)).toMatchObject({ state: 'NEW' });
    // Export, incluso con sobrescribir, nunca borra un archivo sin entidad.
    for (const overwrite of [false, true]) expect((await core.catalogSync.reconcile(a, { mode: 'export', keys: [SK], overwrite }))[0].state).toBe('NEW');
    expect(files.readText(rel)).not.toBeNull();

    const [imp] = await core.catalogSync.reconcile(a, { mode: 'sync', keys: [SK] });
    expect(imp).toMatchObject({ state: 'IMPORTED', version: 1 });
    const skill = await core.catalog.get('skill', SK);
    expect(skill.status).toBe('DRAFT');
    expect(skill.activeVersion).toBeNull();
    expect(skill.versions[0]).toMatchObject({ version: 1, status: 'PENDING_APPROVAL' });
    expect(await statusOf('skill', SK)).toMatchObject({ state: 'PENDING_APPROVAL', version: 1, approvalNumber: imp.approvalNumber });

    await reject(imp.approvalRequestId!);
    expect(files.readText(rel)).toBeNull();
    expect(existsSync(path.join(dir, 'skills', SK))).toBe(false);
    expect(await statusOf('skill', SK)).toMatchObject({ state: 'INACTIVE' });
  });

  it('archivos inválidos (formato o referencias) quedan INVALID y no se importan', async () => {
    files.writeText('agents/AgenteArchivoRoto.md', '---\nname: Roto\n');
    files.writeText('agents/AgenteArchivoRef.md', '---\nname: Con referencia rota\nskills:\n  - SkillQueNoExiste\n---\n\nPrompt.\n');
    const keys = ['AgenteArchivoRoto', 'AgenteArchivoRef'];
    const reports = await core.catalogSync.reconcile(a, { mode: 'sync', keys });
    expect(find(reports, 'agent', 'AgenteArchivoRoto')).toMatchObject({ state: 'INVALID' });
    expect(find(reports, 'agent', 'AgenteArchivoRoto')?.errors?.[0]).toMatch(/cierra el frontmatter/);
    expect(find(reports, 'agent', 'AgenteArchivoRef')).toMatchObject({ state: 'INVALID' });
    expect(find(reports, 'agent', 'AgenteArchivoRef')?.errors).toContain('Skill inexistente: SkillQueNoExiste');
    for (const key of keys) await expect(core.catalog.get('agent', key)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // Sin entidad en la base, ni sobrescribir los toca.
    await core.catalogSync.reconcile(a, { mode: 'export', keys, overwrite: true });
    for (const key of keys) expect(files.readText(`agents/${key}.md`)).not.toBeNull();
    for (const key of keys) files.removeFile(`agents/${key}.md`);
  });

  it('desactivar borra el archivo', async () => {
    const key = 'SkillArchivoBaja';
    await core.catalog.create('skill', key, { name: 'Skill de baja', instructions: '# Baja' }, 'Inicial', a);
    const req = await core.catalog.requestActivation('skill', key, 1, a);
    await approveAll(core, req.id);
    expect(files.readText(`skills/${key}/SKILL.md`)).toContain('# Baja');
    await core.catalog.deactivate('skill', key, a);
    expect(existsSync(path.join(dir, 'skills', key))).toBe(false);
    expect(await statusOf('skill', key)).toMatchObject({ state: 'INACTIVE' });
    expect(await core.audit.list({ action: 'CATALOG_FILE_REMOVED', entityId: key })).toHaveLength(1);
  });

  it('borrar MainSupervisor.md: status informa MISSING_FILE sin escribir y export lo reescribe', async () => {
    const rel = 'agents/MainSupervisor.md';
    files.removeFile(rel);
    const missing = await statusOf('agent', 'MainSupervisor');
    expect(missing.state).toBe('MISSING_FILE');
    expect(files.readText(rel)).toBeNull();
    const reports = await core.catalogSync.reconcile(a, { mode: 'export' });
    expect(find(reports, 'agent', 'MainSupervisor')).toMatchObject({ state: 'EXPORTED', version: missing.version });
    expect(await statusOf('agent', 'MainSupervisor')).toMatchObject({ state: 'IN_SYNC' });
  });

  it('exportAfterChange no lanza: un error de disco queda en la auditoría y en la consola', async () => {
    const rel = `agents/${AG}.md`;
    files.removeFile(rel);
    mkdirSync(path.join(dir, rel)); // un directorio donde va el archivo: la lectura falla
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(core.catalogSync.exportAfterChange(a, ['agent'], [AG])).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
    expect((await core.audit.list({ action: 'CATALOG_FILE_EXPORT_FAILED', entityId: AG })).length).toBeGreaterThan(0);
    rmSync(path.join(dir, rel), { recursive: true, force: true });
    await core.catalogSync.exportAfterChange(a, ['agent'], [AG]);
    expect(await statusOf('agent', AG)).toMatchObject({ state: 'IN_SYNC', version: 2 });
  });
});
