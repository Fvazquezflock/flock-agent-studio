import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { CATALOG_KINDS, CatalogFileError, definitionHash, normalizeDefinition, parseCatalogFile, renderCatalogFile } from '../../src/catalog/file-format';
import { CatalogFileStore } from '../../src/catalog/file-store';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
// Solo lectura: las pruebas nunca escriben en catalog/ del repo.
const repoCatalog = new CatalogFileStore(path.join(repoRoot, 'catalog'));

const tmp = mkdtempSync(path.join(os.tmpdir(), 'mao-catalog-unit-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const agentText = (front: string, body = 'Sos un agente de prueba.') => `---\n${front}\n---\n\n${body}\n`;

describe('archivos del catálogo del repo', () => {
  const entries = CATALOG_KINDS.flatMap((kind) => repoCatalog.list(kind));

  it('hay agentes, skills y orquestadores', () => {
    for (const kind of CATALOG_KINDS) expect(entries.filter((e) => e.kind === kind).length).toBeGreaterThan(0);
    expect(entries.some((e) => e.kind === 'agent' && e.key === 'MainSupervisor')).toBe(true);
  });

  it.each(entries.map((e) => [e.relPath, e] as const))('%s carga y hace round-trip sin pérdida', (_rel, e) => {
    const loaded = repoCatalog.load(e.kind, e.key);
    expect(loaded).not.toBeNull();
    if (!loaded!.ok) throw new Error(loaded!.errors.join('; '));
    // render(parse) conserva el hash.
    const rendered = renderCatalogFile(e.kind, loaded!.definition);
    expect(definitionHash(e.kind, parseCatalogFile(e.kind, rendered))).toBe(loaded!.hash);
    // Con fines de línea CRLF (checkout en Windows sin .gitattributes) el hash es el mismo.
    expect(definitionHash(e.kind, parseCatalogFile(e.kind, loaded!.text.replace(/\r?\n/g, '\r\n')))).toBe(loaded!.hash);
    // Con BOM también.
    expect(definitionHash(e.kind, parseCatalogFile(e.kind, `﻿${loaded!.text}`))).toBe(loaded!.hash);
  });
});

describe('errores de formato', () => {
  const expectError = (fn: () => unknown, re: RegExp) => {
    let caught: unknown;
    try {
      fn();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CatalogFileError);
    expect((caught as Error).message).toMatch(re);
  };

  it('sin frontmatter', () => {
    expectError(() => parseCatalogFile('agent', 'name: X\n\nSos un agente.'), /frontmatter/);
  });

  it('frontmatter sin cierre', () => {
    expectError(() => parseCatalogFile('agent', '---\nname: X\n\nSos un agente.\n'), /cierra el frontmatter/);
  });

  it('línea de cierre con texto extra', () => {
    expectError(() => parseCatalogFile('agent', '---\nname: X\n--- fin\nSos un agente.\n'), /exactamente ---/);
  });

  it('el cuerpo no va en el frontmatter', () => {
    expectError(() => parseCatalogFile('agent', agentText('name: X\nsystemPrompt: hola')), /cuerpo/);
    expectError(() => parseCatalogFile('skill', '---\nname: S\ninstructions: x\n---\n\n# S\n'), /cuerpo/);
  });

  it('YAML con claves duplicadas', () => {
    expectError(() => parseCatalogFile('agent', agentText('name: X\nname: Y')), /YAML inválido/);
    expectError(() => parseCatalogFile('orchestrator', 'name: A\nname: B\n'), /YAML inválido/);
  });

  it('orquestador que no es un objeto', () => {
    expectError(() => parseCatalogFile('orchestrator', '- a\n- b\n'), /objeto/);
  });

  it('definición que no cumple el esquema', () => {
    expectError(() => normalizeDefinition('agent', parseCatalogFile('agent', agentText('description: sin nombre'))), /name/);
  });

  it('clave de archivo inválida y archivo con errores: la carga los informa sin lanzar', () => {
    const store = new CatalogFileStore(tmp);
    store.writeText('agents/1Malo.md', agentText('name: Malo'));
    store.writeText('agents/SinCierre.md', '---\nname: X\n');
    store.writeText('agents/Bueno.md', agentText('name: Bueno'));
    expect(store.list('agent').map((e) => e.key)).toEqual(['1Malo', 'Bueno', 'SinCierre']);
    const bad = store.load('agent', '1Malo');
    expect(bad?.ok).toBe(false);
    expect(bad && !bad.ok && bad.errors[0]).toMatch(/Clave inválida/);
    const open = store.load('agent', 'SinCierre');
    expect(open && !open.ok && open.errors[0]).toMatch(/cierra el frontmatter/);
    expect(store.load('agent', 'Bueno')?.ok).toBe(true);
    expect(store.load('agent', 'NoExiste')).toBeNull();
  });
});

describe('render sin pérdida', () => {
  it('omite vacíos que coinciden con el valor por defecto', () => {
    const text = renderCatalogFile('agent', { name: 'A', systemPrompt: 'Prompt', description: '', tags: [], inputSchema: {} });
    expect(text).not.toMatch(/^description:/m);
    expect(text).not.toMatch(/^tags:/m);
    expect(text).not.toMatch(/^inputSchema:/m);
    expect(definitionHash('agent', parseCatalogFile('agent', text))).toBe(definitionHash('agent', { name: 'A', systemPrompt: 'Prompt' }));
  });

  it('conserva un vacío explícito cuando el valor por defecto no es vacío', () => {
    // model tiene valor por defecto "default": omitir "" cambiaría la definición.
    const def = { name: 'A', systemPrompt: 'Prompt', model: '' };
    const text = renderCatalogFile('agent', def);
    expect(text).toMatch(/^model: ""$/m);
    const back = normalizeDefinition('agent', parseCatalogFile('agent', text));
    expect(back.model).toBe('');
    expect(definitionHash('agent', back)).toBe(definitionHash('agent', def));
    expect(definitionHash('agent', back)).not.toBe(definitionHash('agent', { name: 'A', systemPrompt: 'Prompt' }));
  });

  it('el cuerpo se normaliza (espacios en los extremos y CRLF) y el resto va en el frontmatter', () => {
    const def = { name: 'S', instructions: '\n# Skill\r\n\r\nRegla.\n\n', rules: ['Una regla'] };
    const text = renderCatalogFile('skill', def);
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('\n---\n\n# Skill\n\nRegla.\n');
    expect(text).not.toContain('\r');
    expect(definitionHash('skill', parseCatalogFile('skill', text))).toBe(definitionHash('skill', def));
  });

  it('orquestadores: los pasos conservan los valores por defecto no vacíos', () => {
    const def = {
      name: 'Flujo',
      objective: 'Probar',
      steps: [{ key: 'ctx', name: 'Contexto', handler: 'jira.context', params: { mode: 'epic' }, onError: 'continue', parallelSafe: false }],
    };
    const text = renderCatalogFile('orchestrator', def);
    expect(text).toMatch(/onError: continue/);
    expect(text).toMatch(/parallelSafe: false/);
    expect(definitionHash('orchestrator', parseCatalogFile('orchestrator', text))).toBe(definitionHash('orchestrator', def));
  });
});
