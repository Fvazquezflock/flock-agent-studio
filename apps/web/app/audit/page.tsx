'use client';

import { useEffect, useState } from 'react';
import { fmtDateTime } from '@mao/shared';
import { ErrorBox } from '@/components/common';
import { Button } from '@/components/ui/core';
import { DataTable, Drawer, PageHeader, TableToolbar } from '@/components/ui/containers';
import { JsonView } from '@/components/ui/data';
import { EmptyState, StatusBadge } from '@/components/ui/feedback';
import { Select, TextInput } from '@/components/ui/forms';
import { api, useApi } from '@/lib/api';

const ACTIONS = [
  { value: '', label: 'Todas las acciones' },
  { value: 'EXECUTION', label: 'Ejecuciones' },
  { value: 'APPROVAL', label: 'Aprobaciones' },
  { value: 'EXTERNAL_OPERATION', label: 'Operaciones en Jira' },
  { value: 'WRITE_REJECTED', label: 'Escrituras rechazadas' },
  { value: 'PROPOSAL', label: 'Propuestas' },
  { value: 'ACTIVAT', label: 'Activaciones' },
  { value: 'POLICY', label: 'Políticas' },
  { value: 'CONFIG', label: 'Configuración' },
  { value: 'CONNECTION', label: 'Conexiones' },
];
const ACTORS = [
  { value: '', label: 'Todos los actores' },
  { value: 'USER', label: 'Personas' },
  { value: 'AGENT', label: 'Agentes' },
  { value: 'SYSTEM', label: 'Sistema' },
  { value: 'WORKER', label: 'Worker' },
];
const ACTOR_TONE: Record<string, 'info' | 'brand' | 'neutral' | 'success'> = { USER: 'info', AGENT: 'brand', SYSTEM: 'neutral', WORKER: 'success' };

export default function AuditPage() {
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [actorType, setActorType] = useState('');
  const [execution, setExecution] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const params = new URLSearchParams({ limit: '100' });
  if (q) params.set('q', q);
  if (action) params.set('action', action);
  if (actorType) params.set('actorType', actorType);
  if (execution) params.set('executionId', execution);
  const { data, error, loading, reload } = useApi<any[]>(`/audit?${params}`);
  useEffect(() => {
    if (data) setRows(data);
  }, [data]);
  const more = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    const p = new URLSearchParams(params);
    p.set('before', String(last.id));
    const next = await api.get<any[]>(`/audit?${p}`);
    setRows((r) => [...r, ...next]);
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Auditoría"
        description="Quién inició cada proceso, qué agente intervino, qué se decidió y aprobó, qué operaciones se ejecutaron en Jira y qué errores ocurrieron. Solo inserciones; los datos sensibles se redactan."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Auditoría' }]}
      />
      <div className="flex flex-wrap gap-3">
        <div style={{ width: 280 }}>
          <TextInput icon="search" value={q} onChange={setQ} placeholder="Buscar en el resumen" />
        </div>
        <div style={{ width: 220 }}>
          <Select value={action} onChange={setAction} options={ACTIONS} />
        </div>
        <div style={{ width: 200 }}>
          <Select value={actorType} onChange={setActorType} options={ACTORS} />
        </div>
        <div style={{ width: 180 }}>
          <TextInput mono value={execution} onChange={setExecution} placeholder="EX-12" />
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading && !rows.length}
        rows={rows}
        compact
        onRowClick={setSelected}
        toolbar={<TableToolbar title="Eventos" count={rows.length} />}
        empty={<EmptyState compact icon="list" title="Sin eventos para estos filtros" />}
        footer={rows.length >= 100 ? <Button size="sm" variant="secondary" onClick={more}>Cargar más</Button> : undefined}
        columns={[
          { key: 'at', header: 'Fecha', render: (r: any) => <span className="fk-num">{fmtDateTime(r.at)}</span> },
          { key: 'actor', header: 'Actor', render: (r: any) => <StatusBadge size="sm" tone={ACTOR_TONE[r.actorType] ?? 'neutral'}>{r.actorId}</StatusBadge> },
          { key: 'action', header: 'Acción', render: (r: any) => <span className="fk-mono">{r.action}</span> },
          { key: 'entity', header: 'Entidad', render: (r: any) => `${r.entityType} ${r.entityId.length > 14 ? `${r.entityId.slice(0, 12)}…` : r.entityId}` },
          { key: 'summary', header: 'Resumen', wrap: true },
        ]}
      />
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.action ?? ''} description={selected ? `${fmtDateTime(selected.at)} · ${selected.actorType} ${selected.actorId}` : undefined}>
        {selected && (
          <div className="flex flex-col gap-3">
            <p className="fk-text">{selected.summary}</p>
            <JsonView value={selected} maxHeight={600} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
