'use client';

import { useState } from 'react';
import { ErrorBox, ExecLink, Loading, Status } from '@/components/common';
import { COST_NOTE, ORIGIN_LABEL, PROVIDER_LABEL, UsageTable, tokens, usd, type UsageTotals } from '@/components/usage';
import { Button } from '@/components/ui/core';
import { Card, DataTable, PageHeader, StatCard } from '@/components/ui/containers';
import { EmptyState } from '@/components/ui/feedback';
import { Select } from '@/components/ui/forms';
import { useApi } from '@/lib/api';

type Summary = {
  days: number;
  totals: UsageTotals;
  byAgent: (UsageTotals & { agentKey: string })[];
  byOrigin: (UsageTotals & { origin: string })[];
  byProvider: (UsageTotals & { provider: string })[];
  topExecutions: { executionId: string; number?: number; status?: string; projectKey?: string; orchestratorKey?: string; invocations: number; totalTokens: number; outputTokens: number; costUsd: number }[];
};

export default function UsagePage() {
  const [days, setDays] = useState('30');
  const [project, setProject] = useState('');
  const { data: projects } = useApi<any[]>('/projects');
  const q = new URLSearchParams({ days });
  if (project) q.set('project', project);
  const { data, error, loading, reload } = useApi<Summary>(`/usage?${q}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Consumo de IA"
        description="Tokens consumidos por los agentes en cada invocación de modelo: ejecuciones, planificación del supervisor y pruebas de catálogo. Incluye reintentos y respuestas fuera de contrato."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Consumo de IA' }]}
        actions={
          <Button variant="secondary" icon="refresh" onClick={() => reload()}>
            Actualizar
          </Button>
        }
      />
      <div className="flex flex-wrap gap-3">
        <div style={{ width: 200 }}>
          <Select
            value={days}
            onChange={setDays}
            options={[
              { value: '1', label: 'Últimas 24 horas' },
              { value: '7', label: 'Últimos 7 días' },
              { value: '30', label: 'Últimos 30 días' },
              { value: '90', label: 'Últimos 90 días' },
            ]}
          />
        </div>
        <div style={{ width: 240 }}>
          <Select value={project} onChange={setProject} placeholder="Todos los proyectos" options={(projects ?? []).map((p) => ({ value: p.key, label: `${p.key} · ${p.name}` }))} />
        </div>
      </div>
      <ErrorBox error={error} onRetry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data ? (
        <>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <StatCard label="Tokens totales" value={tokens(data.totals.totalTokens)} icon="bar-chart" hint="Entrada + caché + salida" />
            <StatCard label="Tokens de salida" value={tokens(data.totals.outputTokens)} icon="send" />
            <StatCard label="Invocaciones" value={`${data.totals.invocations}`} icon="zap" hint={data.totals.failed ? `${data.totals.failed} fuera de contrato` : data.totals.simulated ? `${data.totals.simulated} simuladas` : undefined} />
            <StatCard label="Costo estimado" value={usd(data.totals.costUsd)} icon="dollar" hint="Equivalente API" />
          </div>
          {data.totals.invocations === 0 ? (
            <EmptyState icon="bar-chart" title="Sin invocaciones de modelos en el período" />
          ) : (
            <>
              <Card title="Por agente" padding="none">
                <UsageTable rows={data.byAgent} groupKey="agentKey" groupLabel="Agente" />
              </Card>
              <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
                <Card title="Por origen" padding="none">
                  <UsageTable rows={data.byOrigin} groupKey="origin" groupLabel="Origen" render={(v) => ORIGIN_LABEL[v] ?? v} />
                </Card>
                <Card title="Por proveedor" padding="none">
                  <UsageTable rows={data.byProvider} groupKey="provider" groupLabel="Proveedor" render={(v) => PROVIDER_LABEL[v] ?? v} />
                </Card>
              </div>
              <Card title="Ejecuciones con más consumo" padding="none">
                <DataTable
                  compact
                  rowKey="executionId"
                  rows={data.topExecutions}
                  columns={[
                    { key: 'number', header: 'Ejecución', render: (r: any) => (r.number ? <ExecLink id={r.executionId} number={r.number} /> : '—') },
                    { key: 'orchestratorKey', header: 'Orquestador' },
                    { key: 'projectKey', header: 'Proyecto' },
                    { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
                    { key: 'invocations', header: 'Invocaciones', align: 'right' },
                    { key: 'outputTokens', header: 'Salida', align: 'right', render: (r: any) => <span className="fk-num">{tokens(r.outputTokens)}</span> },
                    { key: 'totalTokens', header: 'Total', align: 'right', render: (r: any) => <b className="fk-num">{tokens(r.totalTokens)}</b> },
                    { key: 'costUsd', header: 'Costo est.', align: 'right', render: (r: any) => <span className="fk-num">{usd(r.costUsd)}</span> },
                  ]}
                />
              </Card>
            </>
          )}
          <p className="fk-text fk-text--sm fk-text--subtle">
            {COST_NOTE} Las invocaciones anteriores a este registro se recuperaron de las decisiones de cada etapa, sin desglose de caché.
          </p>
        </>
      ) : null}
    </div>
  );
}
