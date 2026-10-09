'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { ApprovalLink, ErrorBox, Loading } from '@/components/common';
import { Button } from '@/components/ui/core';
import { DataTable, Modal, PageHeader, TableToolbar } from '@/components/ui/containers';
import { DiffView, type DiffLine } from '@/components/ui/data';
import { Alert, EmptyState, StatusBadge, useToast } from '@/components/ui/feedback';
import { Checkbox, FormField, Switch, TextInput } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';
import { CONFIG_SUBJECT_LABEL, KIND_LABEL, fileStateInfo } from '@/lib/labels';

interface CatalogFileRow {
  kind: 'agent' | 'skill' | 'orchestrator';
  key: string;
  relPath: string;
  state: string;
  version?: number;
  approvalRequestId?: string;
  approvalNumber?: number;
  message?: string;
  errors?: string[];
}

interface ConfigFileRow {
  subject: string;
  key?: string;
  relPath: string;
  state: string;
  message?: string;
  errors?: string[];
  diff?: DiffLine[];
}

/** Cada bloque llega como lista o, si ese servicio falló, como { error } (el otro bloque se muestra igual). */
type Block<T> = T[] | { error: string };
interface FilesStatus {
  dir: string;
  catalog: Block<CatalogFileRow>;
  config: Block<ConfigFileRow>;
}
interface SyncResult {
  catalog: CatalogFileRow[];
  config: Block<ConfigFileRow>;
}

type Scope = 'catalog' | 'config';
const OVERWRITE_WORD = 'SOBRESCRIBIR';

const rowsOf = <T,>(b: Block<T> | undefined): T[] => (Array.isArray(b) ? b : []);
const errorOf = (b: Block<unknown> | undefined): string | null => (b && !Array.isArray(b) ? b.error : null);

function FileState({ state, scope }: { state: string; scope: Scope }) {
  const s = fileStateInfo(state, scope);
  return (
    <StatusBadge tone={s.tone} size="sm">
      {s.label}
    </StatusBadge>
  );
}

/** «Exportado: 3 · Importado: 1», sin contar los que ya estaban al día. */
function summarize(rows: { state: string }[], scope: Scope): string {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.state !== 'IN_SYNC') counts.set(r.state, (counts.get(r.state) ?? 0) + 1);
  if (!counts.size) return 'sin cambios';
  return [...counts].map(([s, n]) => `${fileStateInfo(s, scope).label}: ${n}`).join(' · ');
}

function Messages({ row }: { row: { message?: string; errors?: string[] } }) {
  if (!row.message && !row.errors?.length) return <span className="text-ink-muted">—</span>;
  return (
    <div className="flex flex-col gap-1">
      {row.message && <span>{row.message}</span>}
      {!!row.errors?.length && (
        <ul className="list-disc text-danger" style={{ paddingLeft: 18, margin: 0 }}>
          {row.errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Para un archivo nuevo (o inválido sin versión en la base) no hay página de detalle a la que ir. */
const hasDetail = (r: CatalogFileRow) => r.state !== 'NEW' && !(r.state === 'INVALID' && r.version === undefined);

export default function FilesPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<FilesStatus>('/catalog/files');
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyChanges, setOnlyChanges] = useState(false);
  const [openDiff, setOpenDiff] = useState<Record<string, boolean>>({});
  const [lastRun, setLastRun] = useState<(SyncResult & { mode: 'sync' | 'export' }) | null>(null);
  const [exporting, setExporting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [typed, setTyped] = useState('');
  const [applying, setApplying] = useState<ConfigFileRow[] | null>(null);

  const catalog = rowsOf(data?.catalog);
  const config = rowsOf(data?.config);
  const changedConfig = config.filter((r) => r.state === 'CHANGED');
  // Lo que se perdería al exportar sobrescribiendo: cambios sin importar (definiciones) o sin aplicar (configuración).
  // Las definiciones NEW (la base no las conoce) se conservan.
  const lost = [...catalog.filter((r) => r.state === 'CHANGED' || r.state === 'INVALID'), ...config.filter((r) => r.state === 'CHANGED' || r.state === 'INVALID')];
  const dir = data?.dir ?? 'catalog';

  const closeExport = () => {
    setExporting(false);
    setOverwrite(false);
    setTyped('');
  };

  const sync = async (mode: 'sync' | 'export', withOverwrite = false) => {
    setBusy(mode);
    try {
      const r = await api.post<SyncResult>('/catalog/files/sync', { mode, ...(withOverwrite ? { overwrite: true } : {}) });
      setLastRun({ ...r, mode });
      const cfgError = errorOf(r.config);
      toast({
        tone: cfgError ? 'warning' : 'success',
        title: mode === 'sync' ? 'Sincronización completa' : 'Exportación completa',
        text: `Definiciones: ${summarize(r.catalog, 'catalog')}. Configuración: ${cfgError ?? summarize(rowsOf(r.config), 'config')}.`,
      });
      closeExport();
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!applying?.length) return;
    setBusy('apply');
    try {
      const res = await api.post<ConfigFileRow[]>('/catalog/files/apply', { files: applying.map((r) => r.relPath), confirm: true });
      const failed = res.filter((r) => r.state === 'INVALID' || r.errors?.length);
      if (failed.length) {
        toast({ tone: 'warning', title: 'Algunos archivos no se aplicaron', text: failed.map((r) => `${r.relPath}: ${[r.message, ...(r.errors ?? [])].filter(Boolean).join(' · ')}`).join(' — ') });
      } else {
        toast({ tone: 'success', title: 'Configuración aplicada', text: summarize(res, 'config') });
      }
      setApplying(null);
      setOpenDiff({});
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo aplicar', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };

  const imported = lastRun?.catalog.filter((r) => r.state === 'IMPORTED' && r.approvalRequestId && r.approvalNumber) ?? [];
  const shownCatalog = onlyChanges ? catalog.filter((r) => r.state !== 'IN_SYNC') : catalog;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Archivos"
        description={
          <>
            Los archivos de <span className="fk-mono">{dir}/</span> son la fuente de verdad versionada (con git) de agentes, skills, orquestadores y configuración. Un archivo editado a mano o traído con git pull nunca se activa solo: los cambios de definiciones se importan como versiones pendientes de aprobación y la configuración editada a mano se aplica explícitamente.
          </>
        }
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Archivos' }]}
        actions={
          <>
            <Button variant="ghost" size="sm" icon="refresh" loading={loading && !!data} onClick={() => void reload()}>
              Actualizar
            </Button>
            <Button variant="secondary" size="sm" icon="save" disabled={!!busy} onClick={() => setExporting(true)}>
              Exportar desde la base
            </Button>
            <Button size="sm" icon="arrow-up-down" loading={busy === 'sync'} disabled={!!busy && busy !== 'sync'} onClick={() => void sync('sync')}>
              Sincronizar
            </Button>
          </>
        }
      />

      {!data && loading && <Loading />}
      {!data && <ErrorBox error={error} onRetry={reload} />}

      {lastRun && (
        <Alert tone={imported.length ? 'info' : 'success'} title={lastRun.mode === 'sync' ? 'Resultado de la sincronización' : 'Resultado de la exportación'} onClose={() => setLastRun(null)}>
          Definiciones: {summarize(lastRun.catalog, 'catalog')}. Configuración: {errorOf(lastRun.config) ?? summarize(rowsOf(lastRun.config), 'config')}.
          {imported.length > 0 && (
            <>
              {' '}
              Los cambios importados no se activan solos: revisalos y aprobalos en{' '}
              {imported.map((r, i) => (
                <Fragment key={r.relPath}>
                  {i > 0 && ', '}
                  <ApprovalLink id={r.approvalRequestId!} number={r.approvalNumber!} /> ({r.key})
                </Fragment>
              ))}
              .
            </>
          )}
        </Alert>
      )}

      {data && (
        <>
          {errorOf(data.catalog) ? (
            <Alert tone="danger" title="No se pudo leer el estado de las definiciones">
              {errorOf(data.catalog)}
            </Alert>
          ) : (
            <DataTable
              rows={shownCatalog}
              rowKey="relPath"
              toolbar={<TableToolbar title="Definiciones" count={shownCatalog.length} actions={<Switch label="Ocultar los que están al día" checked={onlyChanges} onChange={setOnlyChanges} />} />}
              empty={<EmptyState compact icon="file" title={onlyChanges ? 'Todos los archivos están al día' : 'No hay definiciones en la carpeta ni en la base'} />}
              columns={[
                { key: 'kind', header: 'Tipo', render: (r) => KIND_LABEL[r.kind]?.singular ?? r.kind },
                {
                  key: 'key',
                  header: 'Clave y archivo',
                  // La ruta va debajo de la clave: como columna aparte (monoespaciada, sin cortes) desbordaba la tabla.
                  render: (r) => (
                    <div className="py-2">
                      {hasDetail(r) ? (
                        <Link className="fk-link fk-mono" href={`/${KIND_LABEL[r.kind]?.path ?? r.kind}/${encodeURIComponent(r.key)}`}>
                          {r.key}
                        </Link>
                      ) : (
                        <span className="fk-mono">{r.key}</span>
                      )}
                      <div className="fk-mono text-xs text-ink-muted">{r.relPath}</div>
                    </div>
                  ),
                },
                { key: 'state', header: 'Estado', render: (r) => <FileState state={r.state} scope="catalog" /> },
                {
                  key: 'version',
                  header: 'Versión',
                  render: (r) =>
                    r.version || r.approvalNumber ? (
                      <span className="flex items-center gap-2">
                        {r.version ? <span className="fk-num">v{r.version}</span> : null}
                        {r.approvalRequestId && r.approvalNumber ? <ApprovalLink id={r.approvalRequestId} number={r.approvalNumber} /> : null}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    ),
                },
                { key: 'message', header: 'Mensaje', wrap: true, render: (r) => <Messages row={r} /> },
              ]}
            />
          )}

          {errorOf(data.config) ? (
            <Alert tone="danger" title="No se pudo leer el estado de la configuración">
              {errorOf(data.config)}
            </Alert>
          ) : (
            <div className="fk-tablebox">
              <TableToolbar
                title="Configuración"
                count={config.length}
                actions={
                  changedConfig.length > 1 ? (
                    <Button size="sm" variant="secondary" icon="check" onClick={() => setApplying(changedConfig)}>
                      Aplicar todos ({changedConfig.length})
                    </Button>
                  ) : undefined
                }
              />
              <div className="fk-tablescroll">
                <table className="fk-table">
                  <thead>
                    <tr>
                      <th>Archivo</th>
                      <th>Contenido</th>
                      <th>Estado</th>
                      <th>Mensaje</th>
                      <th className="fk-th--num">
                        <span className="fk-sr">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {!config.length && (
                      <tr className="fk-table__empty">
                        <td colSpan={5}>
                          <EmptyState compact icon="file" title="No hay archivos de configuración" />
                        </td>
                      </tr>
                    )}
                    {config.map((r) => {
                      const open = !!openDiff[r.relPath];
                      return (
                        <Fragment key={r.relPath}>
                          <tr>
                            <td>
                              <span className="fk-mono">{r.relPath}</span>
                            </td>
                            <td>
                              {CONFIG_SUBJECT_LABEL[r.subject] ?? r.subject}
                              {r.key && (
                                <>
                                  {' '}
                                  {r.subject === 'project' ? (
                                    <Link className="fk-link fk-mono" href={`/projects/${encodeURIComponent(r.key)}`}>
                                      {r.key}
                                    </Link>
                                  ) : (
                                    <span className="fk-mono">{r.key}</span>
                                  )}
                                </>
                              )}
                            </td>
                            <td>
                              <FileState state={r.state} scope="config" />
                            </td>
                            <td className="fk-td--wrap">
                              <Messages row={r} />
                            </td>
                            <td className="fk-td--num">
                              {r.state === 'CHANGED' && (
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="ghost" icon={open ? 'chevron-up' : 'chevron-down'} aria-expanded={open} onClick={() => setOpenDiff((o) => ({ ...o, [r.relPath]: !open }))}>
                                    {open ? 'Ocultar diferencias' : 'Ver diferencias'}
                                  </Button>
                                  <Button size="sm" variant="secondary" icon="check" onClick={() => setApplying([r])}>
                                    Aplicar
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={5} className="fk-td--wrap" style={{ background: 'var(--surface-subtle)' }}>
                                <div className="flex flex-col gap-2">
                                  <span className="fk-text fk-text--sm fk-text--muted">Diferencias de la base (−) al archivo (+).</span>
                                  {r.diff?.length ? <DiffView lines={r.diff} maxHeight={360} /> : <span className="fk-text fk-text--sm">Sin diferencias disponibles.</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Modal
        open={exporting}
        onClose={closeExport}
        title="Exportar desde la base"
        description="Escribe en los archivos lo que la base ya conoce: crea los que faltan, reescribe los desactualizados y borra los de entidades sin versión activa. No importa nada ni toca archivos con cambios sin importar o sin aplicar."
        footer={
          <>
            <Button variant="secondary" onClick={closeExport}>
              Cancelar
            </Button>
            <Button variant={overwrite ? 'danger' : 'primary'} icon="save" loading={busy === 'export'} disabled={overwrite && typed !== OVERWRITE_WORD} onClick={() => void sync('export', overwrite)}>
              {overwrite ? 'Sobrescribir archivos' : 'Exportar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Checkbox
            checked={overwrite}
            onChange={(v) => {
              setOverwrite(v);
              setTyped('');
            }}
            label="Sobrescribir también los archivos con cambios sin importar"
            description="Solo para la migración inicial desde una base existente."
          />
          {overwrite && (
            <>
              <Alert tone="danger" title="Se pierden los cambios hechos en los archivos">
                Los archivos con cambios sin importar (o sin aplicar) se reemplazan por lo que tiene la base y se borran los de proyectos que no existen en la base (las definiciones nuevas que la base no conoce se conservan). Esos cambios no se importan ni quedan pendientes de aprobación: solo se pueden recuperar desde git.
              </Alert>
              {lost.length ? (
                <div className="flex flex-col gap-1">
                  <span className="fk-text fk-text--sm">Archivos afectados hoy ({lost.length}):</span>
                  <ul className="fk-mono list-disc" style={{ paddingLeft: 20, margin: 0, fontSize: 12 }}>
                    {lost.map((r) => (
                      <li key={r.relPath}>{r.relPath}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <span className="fk-text fk-text--sm fk-text--muted">Hoy no hay archivos con cambios sin importar: el resultado es el mismo que exportar sin sobrescribir.</span>
              )}
              <FormField
                label={
                  <>
                    Escribí <b className="fk-mono">{OVERWRITE_WORD}</b> para confirmar
                  </>
                }
              >
                <TextInput mono value={typed} onChange={setTyped} aria-label="Texto de confirmación" />
              </FormField>
            </>
          )}
        </div>
      </Modal>

      <Modal
        open={!!applying}
        onClose={() => setApplying(null)}
        size="lg"
        title={applying?.length === 1 ? `Aplicar ${applying[0].relPath}` : `Aplicar ${applying?.length ?? 0} archivos de configuración`}
        description="Se aplica a la base el contenido del archivo, con las mismas validaciones que la interfaz, y queda en la auditoría. Revisá las diferencias antes de confirmar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setApplying(null)}>
              Cancelar
            </Button>
            <Button icon="check" loading={busy === 'apply'} onClick={() => void apply()}>
              Aplicar a la base
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {applying?.map((r) => (
            <div key={r.relPath} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="fk-mono">{r.relPath}</span>
                {r.message && <span className="fk-text fk-text--sm fk-text--muted">{r.message}</span>}
              </div>
              {r.diff?.length ? <DiffView lines={r.diff} maxHeight={260} /> : <span className="fk-text fk-text--sm">Sin diferencias disponibles.</span>}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
