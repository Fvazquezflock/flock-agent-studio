'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import type { BacklogItem, BacklogResult } from '@mao/shared';
import { ErrorBox, Loading } from '@/components/common';
import { Button, IconButton, Icon } from '@/components/ui/core';
import { Card, DataTable, PageHeader, Tabs } from '@/components/ui/containers';
import { Alert, EmptyState, StatusBadge, Tag, type Tone } from '@/components/ui/feedback';
import { Select, Switch, TextInput } from '@/components/ui/forms';
import { useApi } from '@/lib/api';

type Mode = 'epic' | 'story';

/** Estados de Jira localizados: solo una pista visual, no se usan para decidir nada. */
function jiraTone(status: string): Tone {
  if (/listo|done|cerrad|finaliz|resuel|termin/i.test(status)) return 'success';
  if (/curso|progress|revisi|desarroll/i.test(status)) return 'info';
  return 'neutral';
}

/** Jira devuelve fechas como texto local ("2026-10-09 12:03:41 Hora…"): se muestran como dd/mm/aaaa hh:mm. */
function fmtJiraDate(v?: string): string {
  const m = v ? /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(v) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : '—';
}

function IssueKey({ item }: { item: BacklogItem }) {
  return (
    <span className="inline-flex items-center gap-1 fk-mono">
      {item.key}
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" title={`Abrir ${item.key} en Jira`} aria-label={`Abrir ${item.key} en Jira`} className="fk-link inline-flex">
          <Icon name="external-link" size={14} />
        </a>
      )}
    </span>
  );
}

/** Orquestador activo (y habilitado en el proyecto) cuyo contexto lee una épica o una historia. */
function orchestratorFor(orchestrators: any[] | undefined, enabled: string[], mode: Mode) {
  return (orchestrators ?? [])
    .filter((o) => o.status === 'ACTIVE' && o.activeVersion && (!enabled.length || enabled.includes(o.key)))
    .find((o) => o.activeVersion.definition.steps.some((s: any) => s.handler === 'jira.context' && s.params?.mode === mode));
}

function startHref(projectKey: string, orchestrator: any, mode: Mode, key: string) {
  const q = new URLSearchParams({ project: projectKey, orchestrator: orchestrator.key, [mode === 'epic' ? 'epicKey' : 'storyKey']: key, from: 'backlog' });
  return `/executions/new?${q}`;
}

function StoriesOfEpic({ projectKey, epicKey, includeDone, storyOrch }: { projectKey: string; epicKey: string; includeDone: boolean; storyOrch: any }) {
  const q = new URLSearchParams({ kind: 'story', parent: epicKey });
  if (includeDone) q.set('includeDone', '1');
  const { data, error, loading, reload } = useApi<BacklogResult>(`/projects/${projectKey}/backlog?${q}`);
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (loading && !data) return <p className="fk-text fk-text--sm fk-text--subtle">Leyendo historias de {epicKey}…</p>;
  if (!data?.items.length) return <p className="fk-text fk-text--sm fk-text--subtle">Sin historias {includeDone ? '' : 'abiertas '}de tipo «{data?.issueType}» en {epicKey}.</p>;
  return (
    <div className="flex flex-col">
      {data.items.map((s) => (
        <div key={s.key} className="flex flex-wrap items-center gap-3 py-2 border-b border-border last:border-b-0">
          <IssueKey item={s} />
          <span className="fk-text flex-1" style={{ minWidth: 220 }}>
            {s.summary}
          </span>
          <StatusBadge size="sm" tone={jiraTone(s.status)}>
            {s.status}
          </StatusBadge>
          {storyOrch ? (
            <Button size="sm" variant="secondary" icon="check-circle" href={startHref(projectKey, storyOrch, 'story', s.key)}>
              Validar HU
            </Button>
          ) : null}
        </div>
      ))}
      {data.hasMore && <p className="fk-text fk-text--sm fk-text--subtle pt-2">Se muestran las primeras {data.limit} historias.</p>}
    </div>
  );
}

function EpicRow({ epic, projectKey, includeDone, epicOrch, storyOrch }: { epic: BacklogItem; projectKey: string; includeDone: boolean; epicOrch: any; storyOrch: any }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-b-0 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <IconButton icon={open ? 'chevron-down' : 'chevron-right'} label={open ? 'Ocultar historias' : 'Ver historias'} size="sm" onClick={() => setOpen(!open)} aria-expanded={open} />
        <IssueKey item={epic} />
        <button type="button" className="fk-text text-left flex-1" style={{ minWidth: 220, background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} onClick={() => setOpen(!open)}>
          {epic.summary}
        </button>
        <StatusBadge size="sm" tone={jiraTone(epic.status)}>
          {epic.status}
        </StatusBadge>
        <span className="fk-text fk-text--sm fk-text--subtle fk-num">{fmtJiraDate(epic.updated)}</span>
        {epicOrch ? (
          <Button size="sm" icon="zap" href={startHref(projectKey, epicOrch, 'epic', epic.key)}>
            Analizar épica
          </Button>
        ) : (
          <Tag size="sm">Sin flujo de épicas habilitado</Tag>
        )}
      </div>
      {open && (
        <div className="mt-2" style={{ marginLeft: 44 }}>
          <StoriesOfEpic projectKey={projectKey} epicKey={epic.key} includeDone={includeDone} storyOrch={storyOrch} />
        </div>
      )}
    </div>
  );
}

function BacklogView() {
  const sp = useSearchParams();
  const { data: projects, error: pErr } = useApi<any[]>('/projects');
  const { data: orchestrators } = useApi<any[]>('/orchestrators');
  const [projectKey, setProjectKey] = useState(sp.get('project') ?? '');
  const [tab, setTab] = useState<Mode>(sp.get('tab') === 'stories' ? 'story' : 'epic');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [includeDone, setIncludeDone] = useState(false);
  const [onlyOrphans, setOnlyOrphans] = useState(true);

  // Por defecto, el primer proyecto conectado a Jira real.
  useEffect(() => {
    if (!projectKey && projects?.length) setProjectKey((projects.find((p) => p.mode === 'JIRA' && p.status === 'ACTIVE') ?? projects[0]).key);
  }, [projects, projectKey]);

  const { data: project } = useApi<any>(projectKey ? `/projects/${projectKey}` : null);
  const enabled: string[] = project?.resolvedConfig?.enabledOrchestrators ?? [];
  const epicOrch = orchestratorFor(orchestrators, enabled, 'epic');
  const storyOrch = orchestratorFor(orchestrators, enabled, 'story');

  const q = new URLSearchParams({ kind: tab });
  if (tab === 'story' && onlyOrphans && !query) q.set('withoutParent', '1');
  if (query) q.set('q', query);
  if (includeDone) q.set('includeDone', '1');
  const { data, error, loading, reload } = useApi<BacklogResult>(projectKey ? `/projects/${projectKey}/backlog?${q}` : null);

  const search = () => setQuery(text.trim());
  const clear = () => {
    setText('');
    setQuery('');
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Backlog de Jira"
        description="Elegí una épica para analizarla completa (historias y tareas) o una historia para validarla sola. Desde acá solo se lee Jira."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Backlog de Jira' }]}
        actions={
          <Button variant="secondary" icon="refresh" onClick={() => reload()} disabled={!projectKey}>
            Actualizar
          </Button>
        }
      />
      <ErrorBox error={pErr} />
      <div className="flex flex-wrap items-center gap-3">
        <div style={{ width: 260 }}>
          <Select value={projectKey} onChange={(v) => { setProjectKey(v); clear(); }} options={(projects ?? []).map((p) => ({ value: p.key, label: `${p.key} · ${p.name}` }))} />
        </div>
        <div style={{ width: 320 }}>
          <TextInput
            icon="search"
            value={text}
            onChange={setText}
            placeholder={tab === 'epic' ? 'Clave o texto de la épica' : 'Clave o texto de la historia'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') search();
            }}
          />
        </div>
        <Button variant="secondary" onClick={search} disabled={!projectKey}>
          Buscar
        </Button>
        {query && (
          <Button variant="ghost" icon="x" onClick={clear}>
            Limpiar
          </Button>
        )}
        <Switch label="Incluir terminadas" checked={includeDone} onChange={setIncludeDone} />
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setTab(v as Mode)}
        items={[
          { value: 'epic', label: 'Épicas', icon: 'layers', count: tab === 'epic' ? data?.items.length : undefined },
          { value: 'story', label: 'Historias', icon: 'list', count: tab === 'story' ? data?.items.length : undefined },
        ]}
      />

      {data?.mode === 'DEMO' && (
        <Alert tone="info" title="Proyecto de demostración">
          {data.projectKey} usa datos ficticios: no se consulta Jira.
        </Alert>
      )}
      <ErrorBox error={error} onRetry={reload} />
      {data?.hasMore && (
        <Alert tone="warning" title={`Se muestran las primeras ${data.limit}`}>
          Hay más resultados: refiná la búsqueda por clave o texto.
        </Alert>
      )}

      {tab === 'epic' ? (
        <Card
          title={data ? `Épicas ${includeDone ? '' : 'abiertas '}de ${data.jiraProjectKey}` : 'Épicas'}
          subtitle={data ? `Tipo «${data.issueType}» · desplegá una épica para ver sus historias` : undefined}
        >
          {loading && !data ? (
            <Loading label="Leyendo épicas de Jira…" />
          ) : !data?.items.length ? (
            <EmptyState compact icon="layers" title={query ? 'Ninguna épica coincide con la búsqueda' : 'Sin épicas para mostrar'}>
              {!includeDone && !query ? 'Probá con "Incluir terminadas" o revisá el tipo de épica mapeado en el proyecto.' : null}
            </EmptyState>
          ) : (
            <div className="flex flex-col">
              {data.items.map((e) => (
                <EpicRow key={e.key} epic={e} projectKey={projectKey} includeDone={includeDone} epicOrch={epicOrch} storyOrch={storyOrch} />
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <Switch label="Solo historias sin épica" checked={onlyOrphans && !query} onChange={setOnlyOrphans} disabled={!!query} />
          <DataTable
            rowKey="key"
            loading={loading && !data}
            rows={data?.items ?? []}
            empty={
              <EmptyState compact icon="list" title={query ? 'Ninguna historia coincide con la búsqueda' : onlyOrphans ? 'No hay historias sin épica' : 'Sin historias para mostrar'}>
                {onlyOrphans && !query ? 'Las historias que pertenecen a una épica se ven desplegando la épica, o desactivando este filtro.' : null}
              </EmptyState>
            }
            columns={[
              { key: 'key', header: 'Clave', render: (r: BacklogItem) => <IssueKey item={r} /> },
              { key: 'summary', header: 'Resumen', wrap: true, render: (r: BacklogItem) => r.summary },
              { key: 'status', header: 'Estado', render: (r: BacklogItem) => <StatusBadge size="sm" tone={jiraTone(r.status)}>{r.status}</StatusBadge> },
              { key: 'parent', header: 'Épica', render: (r: BacklogItem) => <span className="fk-mono">{r.parentKey ?? '—'}</span> },
              { key: 'updated', header: 'Actualizada', render: (r: BacklogItem) => <span className="fk-num">{fmtJiraDate(r.updated)}</span> },
              {
                key: 'action',
                header: '',
                align: 'right',
                render: (r: BacklogItem) =>
                  storyOrch ? (
                    <Button size="sm" variant="secondary" icon="check-circle" href={startHref(projectKey, storyOrch, 'story', r.key)}>
                      Validar HU
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      )}
      <p className="fk-text fk-text--sm fk-text--subtle">
        «Analizar épica» y «Validar HU» abren Nueva ejecución con todo completado: ahí elegís el proveedor de IA y confirmás. Nada se publica en Jira sin tu aprobación.
      </p>
    </div>
  );
}

export default function BacklogPage() {
  return (
    <Suspense fallback={<Loading />}>
      <BacklogView />
    </Suspense>
  );
}
