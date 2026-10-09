'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { approvalLabel, fmtDateTime } from '@mao/shared';
import { ErrorBox, ExecLink, Status } from '@/components/common';
import { DataTable, PageHeader, Tabs } from '@/components/ui/containers';
import { EmptyState, StatusBadge } from '@/components/ui/feedback';
import { useApi } from '@/lib/api';

const KIND: Record<string, string> = {
  epic_publication: 'Publicación de épica',
  story_publication: 'Publicación de HU',
  conflict_review: 'Revisión por conflicto',
  activation: 'Activación de versión',
  capability_proposal: 'Propuesta de capacidad',
};

export default function ApprovalsPage() {
  const router = useRouter();
  const [tab, setTab] = useState('OPEN');
  const { data, error, loading, reload } = useApi<any[]>(`/approvals${tab === 'OPEN' ? '?status=OPEN' : ''}`, { refreshMs: 5000 });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Aprobaciones"
        description="Toda operación externa, activación o propuesta pasa por acá. Cada solicitud guarda un snapshot inmutable de lo propuesto."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Aprobaciones' }]}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'OPEN', label: 'Pendientes' },
              { value: 'ALL', label: 'Todas' },
            ]}
          />
        }
      />
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading && !data}
        rows={data ?? []}
        onRowClick={(r) => router.push(`/approvals/${r.id}`)}
        empty={<EmptyState compact icon="shield" title={tab === 'OPEN' ? 'No hay aprobaciones pendientes' : 'Todavía no hay solicitudes'} />}
        columns={[
          { key: 'number', header: 'Id', render: (r: any) => <span className="fk-mono">{approvalLabel(r.number)}</span> },
          { key: 'title', header: 'Solicitud', wrap: true },
          { key: 'kind', header: 'Tipo', render: (r: any) => KIND[r.kind] ?? r.kind },
          { key: 'project', header: 'Proyecto', render: (r: any) => r.project?.key ?? '—' },
          { key: 'execution', header: 'Ejecución', render: (r: any) => (r.execution ? <ExecLink id={r.executionId} number={r.execution.number} /> : '—') },
          {
            key: 'counts',
            header: 'Ítems',
            render: (r: any) => (
              <span className="flex flex-wrap gap-1">
                {r.counts.PENDING ? <StatusBadge size="sm" tone="warning">{r.counts.PENDING} pend.</StatusBadge> : null}
                {(r.counts.APPROVED ?? 0) + (r.counts.AUTO_APPROVED ?? 0) ? <StatusBadge size="sm" tone="success">{(r.counts.APPROVED ?? 0) + (r.counts.AUTO_APPROVED ?? 0)} aprob.</StatusBadge> : null}
                {r.counts.REJECTED ? <StatusBadge size="sm" tone="danger">{r.counts.REJECTED} rech.</StatusBadge> : null}
              </span>
            ),
          },
          { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
          { key: 'createdAt', header: 'Creada', render: (r: any) => <span className="fk-num">{fmtDateTime(r.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
