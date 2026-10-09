import { disconnectPrisma } from '@mao/db';
import { Core } from '../core';
import type { ConfigFileReport } from '../config/config-files';
import { KIND_META } from './catalog-service';
import { CATALOG_STATE_LABEL, FILE_SYNC_ACTOR, summarizeCatalogReports, type CatalogFileReport, type CatalogSyncMode } from './sync-service';

/**
 * Sincronización de `catalog/` con la base:
 *   pnpm catalog:status                  estado de cada archivo, sin escribir nada
 *   pnpm catalog:export [--sobrescribir] base → archivos (con --sobrescribir también pisa archivos con cambios sin importar)
 *   pnpm catalog:sync                    export + importa los cambios como versiones pendientes de aprobación
 * La configuración (global, políticas, conexiones, proveedores, proyectos) se exporta en export y sync; nunca se aplica
 * desde acá (eso lo decide el propietario explícitamente). Sale con código 1 si hay archivos inválidos.
 */

const MODES: CatalogSyncMode[] = ['status', 'export', 'sync'];

function parseArgs(argv: string[]): { mode: CatalogSyncMode; overwrite: boolean } {
  let mode: string | undefined;
  let overwrite = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--modo') mode = argv[++i];
    else if (a.startsWith('--modo=')) mode = a.slice('--modo='.length);
    else if (a === '--sobrescribir') overwrite = true;
    else if (a !== '--') throw new Error(`Argumento desconocido: ${a}`);
  }
  if (!mode || !MODES.includes(mode as CatalogSyncMode)) throw new Error(`Indicá --modo ${MODES.join('|')}`);
  if (overwrite && mode !== 'export') throw new Error('--sobrescribir solo se usa con --modo export');
  return { mode: mode as CatalogSyncMode, overwrite };
}

/** Tabla de texto: la última columna (mensaje) no se rellena. */
function table(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ').trimEnd();
  return [line(header), line(widths.map((w) => '-'.repeat(w))), ...rows.map(line)].join('\n');
}

function detail(message?: string, errors?: string[]): string {
  return [message, ...(errors ?? [])].filter(Boolean).join(' · ');
}

function catalogRows(reports: CatalogFileReport[]): string[][] {
  return reports.map((r) => [
    KIND_META[r.kind].label,
    r.key,
    r.relPath,
    r.state,
    [r.version !== undefined ? `v${r.version}` : '', r.approvalNumber !== undefined ? `AP-${r.approvalNumber}` : ''].filter(Boolean).join(' · '),
    detail(r.message, r.errors),
  ]);
}

function configRows(reports: ConfigFileReport[]): string[][] {
  return reports.map((r) => {
    const changes = r.diff?.filter((l) => l.type !== 'same').length;
    return [r.subject, r.key ?? '', r.relPath, r.state, detail([r.message, changes ? `${changes} línea(s) distintas` : ''].filter(Boolean).join('; '), r.errors)];
  });
}

const core = new Core();
try {
  const { mode, overwrite } = parseArgs(process.argv.slice(2));
  const actor = FILE_SYNC_ACTOR;
  console.log(`Catálogo en ${core.catalogFiles.dir} · modo ${mode}${overwrite ? ' (sobrescribir)' : ''}${mode === 'status' ? ' · no escribe archivos ni definiciones' : ''}\n`);

  const catalog = await core.catalogSync.reconcile(actor, { mode, overwrite });
  console.log('Agentes, skills y orquestadores');
  console.log(catalog.length ? table(['Tipo', 'Clave', 'Archivo', 'Estado', 'Versión/AP', 'Mensaje'], catalogRows(catalog)) : '(sin definiciones)');
  console.log(`Resumen: ${summarizeCatalogReports(catalog)}`);
  if (catalog.some((r) => r.state === 'INVALID')) process.exitCode = 1;
  const legend = [...new Set(catalog.map((r) => r.state))].map((s) => `${s} = ${CATALOG_STATE_LABEL[s]}`).join(' · ');
  if (legend) console.log(`Estados: ${legend}`);

  console.log('\nConfiguración');
  try {
    const config = mode === 'status' ? await core.configFiles.status() : await core.configFiles.export(actor, { overwrite });
    console.log(config.length ? table(['Tema', 'Clave', 'Archivo', 'Estado', 'Mensaje'], configRows(config)) : '(sin archivos de configuración)');
    if (config.some((r) => r.state === 'INVALID')) process.exitCode = 1;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`Aviso: no se pudo revisar la configuración: ${message}`);
    if (!/pendiente de implementar/.test(message)) process.exitCode = 1;
  }
} catch (err) {
  console.error('Error en la sincronización del catálogo:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await core.close();
  await disconnectPrisma();
}
