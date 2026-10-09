'use client';

import { useRouter } from 'next/navigation';
import { fmtDateTime, proposalLabel } from '@mao/shared';
import { ErrorBox, Status } from '@/components/common';
import { DataTable, PageHeader } from '@/components/ui/containers';
import { Alert, EmptyState, StatusBadge } from '@/components/ui/feedback';
import { useApi } from '@/lib/api';

const ACTION: Record<string, { label: string; tone: 'success' | 'info' | 'danger' }> = {
  CREATE: { label: 'Crear', tone: 'success' },
  UPDATE: { label: 'Modificar', tone: 'info' },
  CANCEL: { label: 'Cancelar', tone: 'danger' },
};

export default function ProposalsPage() {
  const router = useRouter();
  const { data, error, loading, reload } = useApi<any[]>('/proposals', { refreshMs: 10000 });
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Propuestas de capacidades"
        description="El supervisor detecta capacidades faltantes y CapabilityDesigner diseña propuestas en borrador. Nada se activa sin tu aprobación."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Propuestas' }]}
      />
      <Alert tone="info" title="Autoevolución supervisada">
        Cada propuesta dice si crea una capacidad nueva, modifica una existente o la cancela, y por qué. Al confirmarla se ejecuta su plan (crear o actualizar la versión, activarla y asignarla al proyecto de origen, o quitarla y desactivarla) con tu aprobación de cada paso. Las propuestas no pueden traer código, comandos, dependencias ni permisos.
      </Alert>
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading && !data}
        rows={data ?? []}
        onRowClick={(r) => router.push(`/proposals/${r.id}`)}
        empty={<EmptyState compact icon="sparkles" title="Sin propuestas" />}
        columns={[
          { key: 'number', header: 'Id', render: (r: any) => <span className="fk-mono">{proposalLabel(r.number)}</span> },
          { key: 'action', header: 'Acción', render: (r: any) => <StatusBadge size="sm" tone={ACTION[r.action]?.tone ?? 'neutral'}>{ACTION[r.action]?.label ?? r.action}</StatusBadge> },
          { key: 'title', header: 'Propuesta', wrap: true },
          { key: 'kind', header: 'Tipo' },
          { key: 'targetKey', header: 'Clave', render: (r: any) => <span className="fk-mono">{r.targetKey}</span> },
          { key: 'verification', header: 'Verificación', render: (r: any) => <StatusBadge size="sm" tone={r.verification?.passed ? 'success' : 'danger'}>{r.verification?.passed ? 'Pasa' : 'Con errores'}</StatusBadge> },
          { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
          { key: 'origin', header: 'Origen', render: (r: any) => `${r.createdBy}${r.sourceExecution ? ` · EX-${r.sourceExecution.number}` : ''}` },
          { key: 'createdAt', header: 'Creada', render: (r: any) => fmtDateTime(r.createdAt) },
        ]}
      />
    </div>
  );
}
