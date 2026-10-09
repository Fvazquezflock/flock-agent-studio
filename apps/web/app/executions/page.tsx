'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { fmtDateTime, fmtDuration } from '@mao/shared';
import { ErrorBox, ExecLink, Status } from '@/components/common';
import { Button } from '@/components/ui/core';
import { DataTable, PageHeader, TableToolbar } from '@/components/ui/containers';
import { EmptyState, Tag } from '@/components/ui/feedback';
import { Select } from '@/components/ui/forms';
import { useApi } from '@/lib/api';
import { SOURCE_LABEL } from '@/lib/labels';

const STATUSES = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activas' },
  { value: 'WAITING_APPROVAL', label: 'Esperan aprobación' },
  { value: 'COMPLETED', label: 'Completadas' },
  { value: 'FAILED', label: 'Fallidas' },
  { value: 'CANCELLED', label: 'Canceladas' },
];

function ExecutionsList() {
  const router = useRouter();
  const sp = useSearchParams();
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [project, setProject] = useState(sp.get('project') ?? '');
  const [source, setSource] = useState('');
  const { data: projects } = useApi<any[]>('/projects');
  const q = new URLSearchParams({ limit: '100' });
  if (status) q.set('status', status);
  if (project) q.set('project', project);
  if (source) q.set('source', source);
  const { data, error, loading, reload } = useApi<any[]>(`/executions?${q}`, { refreshMs: 4000 });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ejecuciones"
        description="Todas las ejecuciones, sin importar si se iniciaron desde la interfaz, la CLI o Claude Code."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ejecuciones' }]}
        actions={
          <Button icon="plus" href="/executions/new">
            Nueva ejecución
          </Button>
        }
      />
      <div className="flex flex-wrap gap-3">
        <div style={{ width: 220 }}>
          <Select value={status} onChange={setStatus} options={STATUSES} />
        </div>
        <div style={{ width: 220 }}>
          <Select value={project} onChange={setProject} placeholder="Todos los proyectos" options={(projects ?? []).map((p) => ({ value: p.key, label: `${p.key} · ${p.name}` }))} />
        </div>
        <div style={{ width: 200 }}>
          <Select value={source} onChange={setSource} placeholder="Todos los orígenes" options={Object.entries(SOURCE_LABEL).map(([value, label]) => ({ value, label }))} />
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading && !data}
        rows={data ?? []}
        onRowClick={(r) => router.push(`/executions/${r.id}`)}
        toolbar={<TableToolbar title="Resultados" count={data?.length ?? 0} />}
        empty={<EmptyState compact icon="zap" title="Sin ejecuciones para estos filtros" />}
        columns={[
          { key: 'number', header: 'Id', render: (r: any) => <ExecLink id={r.id} number={r.number} /> },
          { key: 'orch', header: 'Orquestador', render: (r: any) => `${r.orchestratorVersion.orchestrator.key} v${r.orchestratorVersion.version}` },
          { key: 'project', header: 'Proyecto', render: (r: any) => r.project.key },
          { key: 'input', header: 'Entrada', render: (r: any) => <span className="fk-mono">{Object.values(r.input ?? {}).filter((v) => String(v).length < 20).join(' ')}</span> },
          { key: 'source', header: 'Origen', render: (r: any) => SOURCE_LABEL[r.source] ?? r.source },
          { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
          { key: 'step', header: 'Etapa actual', render: (r: any) => r.currentStepKey ?? '—' },
          {
            key: 'sim',
            header: 'Modo',
            render: (r: any) => (r.simulation?.model === 'SIMULATED' || r.simulation?.jira === 'DEMO' ? <Tag size="sm">Demo</Tag> : <Tag size="sm" variant="brand">Real</Tag>),
          },
          { key: 'createdAt', header: 'Creada', render: (r: any) => <span className="fk-num">{fmtDateTime(r.createdAt)}</span> },
          { key: 'dur', header: 'Duración', align: 'right', render: (r: any) => (r.startedAt && r.finishedAt ? fmtDuration(new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) : '—') },
        ]}
      />
    </div>
  );
}

export default function ExecutionsPage() {
  return (
    <Suspense>
      <ExecutionsList />
    </Suspense>
  );
}
