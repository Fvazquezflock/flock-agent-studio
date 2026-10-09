import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CATALOG_KEY_RE, CatalogFileError, catalogRelPath, normalizeDefinition, normalizeText, parseCatalogFile, parseYamlFile, renderCatalogFile, renderYaml, definitionHash } from './file-format';
import type { CatalogKind } from './validation';

export interface CatalogFileEntry {
  kind: CatalogKind;
  key: string;
  /** Relativa a la carpeta del catálogo, con "/". */
  relPath: string;
  absPath: string;
}

export type LoadedCatalogFile =
  | { ok: true; entry: CatalogFileEntry; text: string; definition: Record<string, unknown>; hash: string }
  | { ok: false; entry: CatalogFileEntry; text: string | null; errors: string[] };

/**
 * Acceso a la carpeta del catálogo (por defecto `<repo>/catalog`, o MAO_CATALOG_DIR). Solo lectura y escritura de
 * archivos: las reglas de sincronización con la base (aprobaciones, versiones) viven en CatalogSyncService y ConfigFileService.
 */
export class CatalogFileStore {
  constructor(readonly dir: string) {}

  abs(relPath: string): string {
    const abs = path.resolve(this.dir, relPath);
    const rel = path.relative(this.dir, abs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new CatalogFileError(`Ruta fuera del catálogo: ${relPath}`);
    return abs;
  }

  entry(kind: CatalogKind, key: string): CatalogFileEntry {
    const relPath = catalogRelPath(kind, key);
    return { kind, key, relPath, absPath: this.abs(relPath) };
  }

  /** Archivos presentes de un tipo. Las claves inválidas se devuelven igual (la carga las reporta como error). */
  list(kind: CatalogKind): CatalogFileEntry[] {
    const sub = kind === 'agent' ? 'agents' : kind === 'skill' ? 'skills' : 'orchestrators';
    const base = path.join(this.dir, sub);
    if (!existsSync(base)) return [];
    const out: CatalogFileEntry[] = [];
    for (const name of readdirSync(base).sort()) {
      if (kind === 'skill') {
        if (statSync(path.join(base, name)).isDirectory() && existsSync(path.join(base, name, 'SKILL.md'))) out.push(this.entry(kind, name));
      } else if (kind === 'agent' && name.endsWith('.md')) out.push(this.entry(kind, name.slice(0, -3)));
      else if (kind === 'orchestrator' && name.endsWith('.yaml')) out.push(this.entry(kind, name.slice(0, -5)));
    }
    return out;
  }

  readText(relPath: string): string | null {
    const abs = this.abs(relPath);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  }

  /** Lee y valida contra el esquema (no valida referencias: eso lo hace el catálogo). null si no existe. */
  load(kind: CatalogKind, key: string): LoadedCatalogFile | null {
    const entry = this.entry(kind, key);
    const text = this.readText(entry.relPath);
    if (text === null) return null;
    if (!CATALOG_KEY_RE.test(key)) return { ok: false, entry, text, errors: [`Clave inválida "${key}": usá letras, números, "_" o "-" y empezá con una letra`] };
    try {
      const definition = normalizeDefinition(kind, parseCatalogFile(kind, text));
      return { ok: true, entry, text, definition, hash: definitionHash(kind, definition) };
    } catch (err) {
      return { ok: false, entry, text, errors: err instanceof CatalogFileError ? err.errors : [err instanceof Error ? err.message : String(err)] };
    }
  }

  /** Escribe solo si cambia el texto (ignorando fines de línea). Escritura atómica (archivo temporal + rename). */
  writeText(relPath: string, text: string): boolean {
    const abs = this.abs(relPath);
    const current = existsSync(abs) ? readFileSync(abs, 'utf8') : null;
    if (current !== null && normalizeText(current) === normalizeText(text)) return false;
    mkdirSync(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${process.pid}.tmp`;
    writeFileSync(tmp, text, 'utf8');
    renameSync(tmp, abs);
    return true;
  }

  /** Escribe la definición de una entidad. Devuelve si el archivo cambió. */
  write(kind: CatalogKind, key: string, definition: unknown): { relPath: string; changed: boolean } {
    const { relPath } = this.entry(kind, key);
    return { relPath, changed: this.writeText(relPath, renderCatalogFile(kind, definition)) };
  }

  /** Borra el archivo (y la carpeta de la skill). Devuelve si existía. */
  remove(kind: CatalogKind, key: string): boolean {
    const { absPath } = this.entry(kind, key);
    if (!existsSync(absPath)) return false;
    if (kind === 'skill') rmSync(path.dirname(absPath), { recursive: true, force: true });
    else rmSync(absPath, { force: true });
    return true;
  }

  // ---------- Configuración (YAML) ----------

  /** YAML parseado o null si no existe. Lanza CatalogFileError si es inválido. */
  readYaml(relPath: string): unknown {
    const text = this.readText(relPath);
    return text === null ? null : parseYamlFile(text, relPath);
  }

  writeYaml(relPath: string, value: unknown, headerLines: string[] = []): boolean {
    return this.writeText(relPath, renderYaml(value, headerLines));
  }

  removeFile(relPath: string): boolean {
    const abs = this.abs(relPath);
    if (!existsSync(abs)) return false;
    rmSync(abs, { force: true });
    return true;
  }

  /** Nombres de archivo (sin extensión) de una subcarpeta con YAML, p. ej. projects → ['SCRUM']. */
  listYaml(subdir: string): string[] {
    const base = this.abs(subdir);
    if (!existsSync(base)) return [];
    return readdirSync(base)
      .filter((n) => n.endsWith('.yaml'))
      .map((n) => n.slice(0, -5))
      .sort();
  }
}
