import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parse as parseYaml, stringify } from 'yaml';
import { Core } from '../../src/index';
import { actor, testCore } from './helpers';

/**
 * Archivos de configuración de catalog/ con un Core propio sobre una carpeta temporal. La base es compartida con las
 * demás pruebas de la corrida: claves únicas y sin suponer que no hay otros proyectos o políticas. El registro de hashes
 * (GlobalSetting catalog.files) también es compartido: las ediciones a mano usan contenido único.
 */
const suffix = Date.now().toString(36).toUpperCase().slice(-6);
const KEY = `CF_${suffix}`;
const NEW_KEY = `CN_${suffix}`;
const CONN = `cf-${suffix.toLowerCase()}`;

let base: Core;
let core: Core;
let dir: string;
let projectId: string;

const file = (rel: string) => path.join(dir, rel);
const read = (rel: string) => readFileSync(file(rel), 'utf8');
const yaml = (rel: string) => parseYaml(read(rel)) as any;
const write = (rel: string, text: string) => writeFileSync(file(rel), text, 'utf8');
const stateOf = async (rel: string) => (await core.configFiles.status()).find((r) => r.relPath === rel);
const policyOf = (doc: any, project: string, operation: string) => (doc.policies as any[]).find((p) => p.project === project && p.operation === operation);

beforeAll(async () => {
  base = await testCore();
  // Proyecto creado con el Core de la corrida: la carpeta temporal empieza vacía.
  const project = await base.config.createProject({ key: KEY, name: 'Configuración en archivos', jiraProjectKey: 'CFG', mode: 'JIRA', connectionKey: 'jira-mcp', providerKey: 'claude-local' }, actor(base));
  projectId = project.id;
  // Política de un proyecto DEMO (mismo modo que el valor por defecto: no cambia el comportamiento de otras pruebas).
  await base.policies.upsert({ scope: 'PROJECT', projectKey: 'DEMO', operationType: 'READ_EXTERNAL', mode: 'AUTO_APPROVED', mandatory: false, description: 'prueba de archivos', rules: {} }, actor(base));
  dir = mkdtempSync(path.join(os.tmpdir(), 'mao-config-files-'));
  core = new Core({ ownerName: 'Propietario de prueba', catalogDir: dir });
});

afterAll(async () => {
  await core?.close();
  await base?.close();
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('archivos de configuración en catalog/', () => {
  it('el export inicial escribe los archivos sin DEMO, sin el simulado, sin writeEnabled ni secretos', async () => {
    const reports = await core.configFiles.export(actor(core));
    for (const rel of ['global.yaml', 'policies.yaml', 'connections.yaml', 'providers.yaml', `projects/${KEY}.yaml`]) {
      expect(reports.find((r) => r.relPath === rel)?.state, rel).toBe('EXPORTED');
      expect(existsSync(file(rel)), rel).toBe(true);
    }
    expect(read('global.yaml')).toMatch(/^# /);
    expect(read('global.yaml')).toContain('pnpm mao files apply');
    expect(existsSync(file('projects/DEMO.yaml'))).toBe(false);
    expect((yaml('policies.yaml').policies as any[]).some((p) => p.project === 'DEMO')).toBe(false);
    expect((yaml('providers.yaml').providers as any[]).some((p) => p.kind === 'MOCK' || p.key === 'mock')).toBe(false);
    expect(read('connections.yaml')).not.toMatch(/writeEnabled|command|status|capabilities|lastError/);
    expect(yaml(`projects/${KEY}.yaml`)).toMatchObject({ name: 'Configuración en archivos', jiraProjectKey: 'CFG', mode: 'JIRA', connection: 'jira-mcp', provider: 'claude-local', config: { language: 'es-AR' } });

    const status = await core.configFiles.status();
    expect(status.filter((r) => r.state !== 'IN_SYNC')).toEqual([]);
    expect((await core.configFiles.export(actor(core))).some((r) => r.state === 'EXPORTED')).toBe(false);
    expect(await core.deps.prisma.auditEvent.count({ where: { action: 'CONFIG_FILE_EXPORTED' } })).toBeGreaterThan(0);
  });

  it('los cambios desde los servicios reescriben el archivo correspondiente', async () => {
    await core.policies.upsert({ scope: 'PROJECT', projectKey: KEY, operationType: 'CREATE_ISSUE', mode: 'ALWAYS_APPROVE', mandatory: false, description: 'desde el servicio', rules: {} }, actor(core));
    expect(policyOf(yaml('policies.yaml'), KEY, 'CREATE_ISSUE')).toMatchObject({ scope: 'PROJECT', mode: 'ALWAYS_APPROVE', description: 'desde el servicio' });

    const cfg = (await core.config.activeProjectConfig(projectId)).config as Record<string, unknown>;
    await core.config.saveProjectConfig(KEY, { ...cfg, technologies: ['Go'] }, 'prueba de archivos', actor(core));
    expect(yaml(`projects/${KEY}.yaml`).config.technologies).toEqual(['Go']);

    // Cambiar solo el nombre no toca el modo ni la descripción (el esquema parcial trae valores por defecto).
    await core.config.updateProject(KEY, { name: 'Configuración en archivos (renombrado)' }, actor(core));
    expect(yaml(`projects/${KEY}.yaml`)).toMatchObject({ name: 'Configuración en archivos (renombrado)', mode: 'JIRA', connection: 'jira-mcp' });

    await core.connections.create({ key: CONN, name: 'Otra conexión de prueba', envFile: 'MCP/otra-prueba.env' }, actor(core));
    expect((yaml('connections.yaml').connections as any[]).find((c) => c.key === CONN)).toEqual({ key: CONN, name: 'Otra conexión de prueba', kind: 'MCP_STDIO', purpose: 'JIRA', envFile: 'MCP/otra-prueba.env' });

    await core.providers.update('anthropic-api', { config: { maxTokens: 2048, apiKey: 'sk-ant-api03-noesunaclavereal000' } }, actor(core));
    const provider = (yaml('providers.yaml').providers as any[]).find((p) => p.key === 'anthropic-api');
    expect(provider.config).toMatchObject({ maxTokens: 2048, apiKeyEnv: 'ANTHROPIC_API_KEY' });
    expect(read('providers.yaml')).not.toContain('sk-ant');

    expect((await core.configFiles.status()).filter((r) => r.state !== 'IN_SYNC')).toEqual([]);
  });

  it('un archivo viejo (ya exportado) queda STALE_FILE y export lo reescribe', async () => {
    const old = read('policies.yaml');
    await core.policies.upsert({ scope: 'PROJECT', projectKey: KEY, operationType: 'CREATE_ISSUE', mode: 'BATCH_APPROVAL', mandatory: false, description: 'desde el servicio', rules: {} }, actor(core));
    expect(read('policies.yaml')).not.toBe(old);
    write('policies.yaml', old);
    expect((await stateOf('policies.yaml'))?.state).toBe('STALE_FILE');
    const reports = await core.configFiles.export(actor(core));
    expect(reports.find((r) => r.relPath === 'policies.yaml')?.state).toBe('EXPORTED');
    expect(policyOf(yaml('policies.yaml'), KEY, 'CREATE_ISSUE').mode).toBe('BATCH_APPROVAL');
    expect((await stateOf('policies.yaml'))?.state).toBe('IN_SYNC');
  });

  it('un archivo editado a mano queda CHANGED con diff, export no lo pisa y apply lo aplica', async () => {
    const rel = `projects/${KEY}.yaml`;
    const doc = yaml(rel);
    doc.description = `Editado a mano ${suffix}`;
    doc.config.technologies = ['Go', 'Rust'];
    write(rel, stringify(doc));
    const st = await stateOf(rel);
    expect(st?.state).toBe('CHANGED');
    expect(st?.diff?.some((l) => l.type === 'add' && l.text.includes('Rust'))).toBe(true);
    expect(st?.diff?.some((l) => l.type === 'del' && l.text.includes('"description": ""'))).toBe(true);

    const edited = read(rel);
    const exported = await core.configFiles.export(actor(core));
    expect(exported.find((r) => r.relPath === rel)?.state).toBe('CHANGED');
    expect(read(rel)).toBe(edited);

    const res = await core.configFiles.apply(actor(core), [`catalog/${rel}`]);
    expect(res.find((r) => r.relPath === rel)).toMatchObject({ state: 'APPLIED' });
    const active = await core.config.activeProjectConfig(projectId);
    expect(active.changeNote).toBe(`Aplicado desde catalog/${rel}`);
    expect((active.config as { technologies: string[] }).technologies).toEqual(['Go', 'Rust']);
    expect((await core.deps.prisma.project.findUniqueOrThrow({ where: { key: KEY } })).description).toBe(`Editado a mano ${suffix}`);
    // Queda en forma canónica (con encabezado) y sincronizado.
    expect(read(rel).startsWith('# ')).toBe(true);
    expect((await stateOf(rel))?.state).toBe('IN_SYNC');
    expect(await core.deps.prisma.auditEvent.count({ where: { action: 'CONFIG_FILE_APPLIED', entityId: rel } })).toBe(1);
  });

  it('apply valida las políticas: una que relaja una obligatoria falla y no se aplica nada del archivo', async () => {
    const doc = yaml('policies.yaml');
    doc.policies.push({ scope: 'PROJECT', project: KEY, operation: 'ACTIVATE_SKILL', mode: 'AUTO_APPROVED', description: 'relaja una obligatoria' });
    policyOf(doc, KEY, 'CREATE_ISSUE').mode = 'DENIED';
    write('policies.yaml', stringify(doc));
    expect((await stateOf('policies.yaml'))?.state).toBe('CHANGED');

    const res = await core.configFiles.apply(actor(core));
    const r = res.find((x) => x.relPath === 'policies.yaml');
    expect(r?.state).toBe('INVALID');
    expect(r?.errors?.join(' ')).toMatch(/ACTIVATE_SKILL \(PROJECT .*\): .*ALWAYS_APPROVE/);
    const active = await core.deps.prisma.approvalPolicy.findMany({ where: { projectId, status: 'ACTIVE' } });
    expect(active.find((p) => p.operationType === 'ACTIVATE_SKILL')).toBeUndefined();
    expect(active.find((p) => p.operationType === 'CREATE_ISSUE')?.mode).toBe('BATCH_APPROVAL');
    expect((await stateOf('policies.yaml'))?.state).toBe('CHANGED');

    // Corregido: se aplica lo válido; una política que falta en el archivo no se borra (se vuelve a exportar).
    doc.policies = (doc.policies as any[]).filter((p) => p.operation !== 'ACTIVATE_SKILL' && !(p.scope === 'GLOBAL' && p.operation === 'READ_EXTERNAL'));
    write('policies.yaml', stringify(doc));
    const ok = (await core.configFiles.apply(actor(core), ['policies.yaml'])).find((x) => x.relPath === 'policies.yaml');
    expect(ok?.state).toBe('APPLIED');
    expect(ok?.message).toMatch(/no se borran/);
    const after = await core.deps.prisma.approvalPolicy.findFirst({ where: { projectId, operationType: 'CREATE_ISSUE', status: 'ACTIVE' } });
    expect(after?.mode).toBe('DENIED');
    expect((yaml('policies.yaml').policies as any[]).some((p) => p.scope === 'GLOBAL' && p.operation === 'READ_EXTERNAL')).toBe(true);
    expect((await stateOf('policies.yaml'))?.state).toBe('IN_SYNC');
  });

  it('seedFromFiles crea un proyecto desde su archivo cuando no existe en la base', async () => {
    const rel = `projects/${NEW_KEY}.yaml`;
    write(rel, stringify({ name: 'Desde archivo', jiraProjectKey: 'NEW', connection: 'jira-mcp', provider: 'claude-local', config: { technologies: ['Kotlin'] } }));
    expect((await stateOf(rel))?.state).toBe('CHANGED');

    const { created } = await core.configFiles.seedFromFiles();
    expect(created).toContain(rel);
    const p = await core.deps.prisma.project.findUniqueOrThrow({ where: { key: NEW_KEY }, include: { configurations: true, connection: true, defaultProvider: true } });
    expect(p).toMatchObject({ mode: 'JIRA', status: 'ACTIVE', connection: { key: 'jira-mcp' }, defaultProvider: { key: 'claude-local' } });
    expect(p.configurations).toHaveLength(1);
    expect(p.configurations[0]).toMatchObject({ version: 1, status: 'ACTIVE' });
    expect((p.configurations[0].config as { technologies: string[] }).technologies).toEqual(['Kotlin']);
    expect((await stateOf(rel))?.state).toBe('IN_SYNC');
    expect((await core.configFiles.seedFromFiles()).created).toEqual([]);

    // Si el proyecto pasa a DEMO, el archivo (contenido conocido) se borra.
    await core.config.updateProject(NEW_KEY, { mode: 'DEMO', connectionKey: null }, actor(core));
    expect(existsSync(file(rel))).toBe(false);
  });

  it('exportAfterChange nunca lanza: audita el error', async () => {
    const notDir = file('no-es-carpeta.txt');
    writeFileSync(notDir, 'x');
    const broken = new Core({ ownerName: 'Propietario de prueba', catalogDir: notDir });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await expect(broken.configFiles.exportAfterChange(actor(broken))).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
      await broken.close();
    }
    expect(await core.deps.prisma.auditEvent.count({ where: { action: 'CONFIG_FILE_EXPORT_FAILED' } })).toBeGreaterThan(0);
  });
});
