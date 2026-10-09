import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { catalogFilesApplyRequest, catalogFilesSyncRequest } from '@mao/shared';
import { sanitize, toPlatformError, type Actor, type CatalogFileReport, type ConfigFileReport, type Core } from '@mao/core';
import { actorOf, parse } from '../http';

/** Bloque del estado que no se pudo calcular: se informa sin romper el resto de la respuesta. */
const failed = (err: unknown) => ({ error: sanitize(toPlatformError(err).message) });

async function settle<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await fn();
  } catch (err) {
    return failed(err);
  }
}

/** Carpeta del catálogo relativa a la raíz del repo, con "/" (no expone rutas absolutas del equipo). */
export function catalogDirLabel(core: Core): string {
  return path.relative(core.deps.repoRoot, core.deps.catalogDir).split(path.sep).join('/') || '.';
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resumen de una línea, p. ej. «Catálogo (catalog): 17 al día, 1 importado como pendiente de aprobación (AP-12), 0 inválidos». */
export function catalogFilesSummary(report: CatalogFileReport[], dir: string): string {
  const count = (...states: CatalogFileReport['state'][]) => report.filter((r) => states.includes(r.state));
  const aps = (rows: CatalogFileReport[]) => {
    const n = [...new Set(rows.map((r) => r.approvalNumber).filter((x): x is number => typeof x === 'number'))];
    return n.length ? ` (${n.map((x) => `AP-${x}`).join(', ')})` : '';
  };
  const imported = count('IMPORTED');
  const pending = count('PENDING_APPROVAL');
  const exported = count('EXPORTED').length;
  const removed = count('REMOVED').length;
  const unimported = count('CHANGED', 'NEW').length;
  const unexported = count('MISSING_FILE', 'STALE_FILE').length;
  const invalid = count('INVALID').length;
  const parts = [`${count('IN_SYNC').length} al día`];
  if (exported) parts.push(plural(exported, 'exportado', 'exportados'));
  if (removed) parts.push(plural(removed, 'archivo borrado', 'archivos borrados'));
  if (imported.length) parts.push(`${plural(imported.length, 'importado como pendiente', 'importados como pendientes')} de aprobación${aps(imported)}`);
  if (pending.length) parts.push(`${plural(pending.length, 'pendiente', 'pendientes')} de aprobación${aps(pending)}`);
  if (unimported) parts.push(`${unimported} con cambios sin importar (pnpm mao files sync)`);
  if (unexported) parts.push(`${unexported} sin exportar (pnpm mao files export)`);
  parts.push(`${plural(invalid, 'inválido', 'inválidos')}${invalid ? ' (pnpm mao files)' : ''}`);
  return `Catálogo (${dir}): ${parts.join(', ')}`;
}

/** Resumen de una línea, p. ej. «Configuración: 4 al día, 1 archivo con cambios sin aplicar (pnpm mao files apply)». */
export function configFilesSummary(report: ConfigFileReport[]): string {
  const n = (...states: ConfigFileReport['state'][]) => report.filter((r) => states.includes(r.state)).length;
  const parts = [`${n('IN_SYNC')} al día`];
  if (n('EXPORTED')) parts.push(plural(n('EXPORTED'), 'exportado', 'exportados'));
  if (n('CHANGED')) parts.push(`${plural(n('CHANGED'), 'archivo con cambios sin aplicar', 'archivos con cambios sin aplicar')} (pnpm mao files apply)`);
  if (n('MISSING_FILE', 'STALE_FILE')) parts.push(`${n('MISSING_FILE', 'STALE_FILE')} sin exportar (pnpm mao files export)`);
  if (n('INVALID')) parts.push(`${plural(n('INVALID'), 'inválido', 'inválidos')} (pnpm mao files)`);
  return `Configuración: ${parts.join(', ')}`;
}

/**
 * Sincronización de archivos al arrancar la API (MAO_CATALOG_SYNC: sync por defecto, export u off). Un cambio en los
 * archivos nunca se activa solo: las definiciones se importan como versiones pendientes de aprobación y la configuración
 * editada a mano solo se informa (se aplica con `pnpm mao files apply`); la que falta o quedó vieja se escribe desde la
 * base. Nunca lanza: un problema con los archivos no impide arrancar.
 */
export async function syncCatalogFilesOnStartup(
  core: Core,
  setting = process.env.MAO_CATALOG_SYNC,
  log: Pick<Console, 'log' | 'warn'> = console,
): Promise<void> {
  const raw = (setting || 'sync').trim().toLowerCase();
  if (raw === 'off') {
    log.log('Archivos del catálogo: sincronización al arrancar deshabilitada (MAO_CATALOG_SYNC=off)');
    return;
  }
  const mode = raw === 'export' ? 'export' : 'sync';
  if (raw !== mode) log.warn(`MAO_CATALOG_SYNC=${raw} no es válido (sync, export u off): se usa sync`);
  const dir = catalogDirLabel(core);
  const actor: Actor = { type: 'SYSTEM', id: 'sincronización de archivos' };
  let installed = 0;
  try {
    // Base nueva: la instalación inicial (pnpm db:seed) instala catalog/ como versiones activas. Importar acá dejaría todo
    // como pendiente de aprobación y el seed ya no lo consideraría una instalación nueva.
    const prisma = core.deps.prisma;
    installed = (await prisma.agent.count()) + (await prisma.skill.count()) + (await prisma.orchestrator.count());
    if (!installed) log.warn(`Catálogo (${dir}): la base no tiene catálogo instalado; corré pnpm db:seed para instalarlo desde los archivos.`);
    else log.log(catalogFilesSummary(await core.catalogSync.reconcile(actor, { mode }), dir));
  } catch (err) {
    log.warn(`Aviso: no se pudo sincronizar el catálogo con ${dir} (${failed(err).error}). La API arranca igual.`);
  }
  try {
    // Escribe solo lo que falta o quedó viejo; los archivos con cambios sin aplicar no se tocan (se aplican explícitamente).
    log.log(configFilesSummary(installed ? await core.configFiles.export(actor) : await core.configFiles.status()));
  } catch (err) {
    log.warn(`Aviso: no se pudo actualizar la configuración en ${dir} (${failed(err).error}). La API arranca igual.`);
  }
}

/**
 * Archivos de `catalog/` (fuente de verdad versionada de definiciones y configuración). Los cambios de definiciones en
 * los archivos se importan como versiones pendientes de aprobación; la configuración editada a mano se aplica solo con
 * una acción explícita del propietario (`apply` con `confirm: true`).
 */
export function registerCatalogFileRoutes(app: FastifyInstance, core: Core) {
  app.get('/api/catalog/files', async () => {
    const [catalog, config] = await Promise.all([settle(() => core.catalogSync.status()), settle(() => core.configFiles.status())]);
    return { dir: catalogDirLabel(core), catalog, config };
  });

  // Si falla el catálogo no se toca la configuración (error de la solicitud); si falla la configuración, el resultado
  // del catálogo (que ya escribió archivos o importó versiones) se devuelve igual con el error de la configuración.
  app.post('/api/catalog/files/sync', async (req) => {
    const body = parse(catalogFilesSyncRequest, req.body);
    const actor = actorOf(core, req);
    const catalog = await core.catalogSync.reconcile(actor, { mode: body.mode, overwrite: body.overwrite });
    const config = await settle(() => core.configFiles.export(actor, { overwrite: body.overwrite }));
    return { catalog, config };
  });

  app.post('/api/catalog/files/apply', async (req) => {
    const body = parse(catalogFilesApplyRequest, req.body);
    return core.configFiles.apply(actorOf(core, req), body.files);
  });
}
