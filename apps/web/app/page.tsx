'use client';

import { fmtDateTime } from '@mao/shared';
import { ErrorBox, ExecLink, Loading, Status } from '@/components/common';
import { Button } from '@/components/ui/core';
import { Card, Col, DataTable, Grid, PageHeader, StatCard, Timeline } from '@/components/ui/containers';
import { Alert, EmptyState } from '@/components/ui/feedback';
import { useApi } from '@/lib/api';
import { SOURCE_LABEL } from '@/lib/labels';

export default function DashboardPage() {
  const { data, error, loading, reload } = useApi<any>('/dashboard', { refreshMs: 5000 });
  const { data: status } = useApi<any>('/status', { refreshMs: 15000 });
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const c = data.counts;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Inicio"
        description="Estado de la plataforma: proyectos, agentes, ejecuciones y aprobaciones pendientes."
        actions={
          <>
            <Button variant="secondary" icon="shield" href="/approvals">
              Revisar aprobaciones
            </Button>
            <Button icon="plus" href="/executions/new">
              Nueva ejecución
            </Button>
          </>
        }
      />
      {status && status.worker !== 'Disponible' && (
        <Alert tone="warning" title="No se detecta el worker">
          Las ejecuciones quedan en cola hasta que el worker esté activo. Iniciá <span className="fk-mono">pnpm dev:worker</span>.
        </Alert>
      )}
      <Grid cols={4}>
        <StatCard label="Proyectos" value={c.projects} icon="folder" href="/projects" />
        <StatCard label="Agentes activos" value={c.agents} icon="users" href="/agents" />
        <StatCard label="Orquestadores" value={c.orchestrators} icon="git-branch" href="/orchestrators" />
        <StatCard label="Aprobaciones pendientes" value={c.pendingApprovals} icon="shield" href="/approvals" brand={c.pendingApprovals > 0} />
        <StatCard label="Ejecuciones activas" value={c.active} icon="zap" href="/executions?status=ACTIVE" hint={c.waiting ? `${c.waiting} esperan aprobación` : 'Ninguna esperando aprobación'} />
        <StatCard label="Ejecuciones completadas" value={c.completed} icon="check-circle" href="/executions?status=COMPLETED" />
        <StatCard label="Ejecuciones con error" value={c.failed} icon="alert-circle" href="/executions?status=FAILED" />
        <StatCard label="Propuestas de capacidades" value={c.proposals} icon="sparkles" href="/proposals" hint="Borradores y en aprobación" />
      </Grid>
      <Grid cols={12}>
        <Col span={8}>
          <Card title="Ejecuciones recientes" actions={<Button size="sm" variant="ghost" href="/executions">Ver todas</Button>} padding="none">
            <DataTable
              rows={data.recent}
              compact
              empty={<EmptyState compact icon="zap" title="Todavía no hay ejecuciones" actions={<Button size="sm" href="/executions/new">Crear la primera</Button>} />}
              columns={[
                { key: 'number', header: 'Id', render: (r: any) => <ExecLink id={r.id} number={r.number} /> },
                { key: 'orch', header: 'Orquestador', render: (r: any) => r.orchestratorVersion.orchestrator.key },
                { key: 'project', header: 'Proyecto', render: (r: any) => r.project.key },
                { key: 'source', header: 'Origen', render: (r: any) => SOURCE_LABEL[r.source] ?? r.source },
                { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
                { key: 'createdAt', header: 'Creada', render: (r: any) => <span className="fk-num">{fmtDateTime(r.createdAt)}</span> },
              ]}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card title="Actividad reciente" actions={<Button size="sm" variant="ghost" href="/audit">Auditoría</Button>}>
            {data.activity.length === 0 ? (
              <EmptyState compact title="Sin actividad" />
            ) : (
              <Timeline
                items={data.activity.slice(0, 8).map((a: any) => ({
                  title: a.summary,
                  meta: `${fmtDateTime(a.at)} · ${a.actorId}`,
                  icon: a.action.includes('APPROV') ? 'shield' : a.action.includes('EXECUTION') ? 'zap' : a.action.includes('PROPOSAL') ? 'sparkles' : 'circle-dot',
                  tone: a.action.includes('FAILED') || a.action.includes('REJECT') ? 'danger' : a.action.includes('COMPLETED') || a.action.includes('DECIDED') ? 'success' : undefined,
                }))}
              />
            )}
          </Card>
        </Col>
      </Grid>
      {data.errors.length > 0 && (
        <Card title="Errores recientes">
          <Timeline
            items={data.errors.map((e: any) => ({
              title: e.message,
              meta: `${fmtDateTime(e.createdAt)} · EX-${e.execution.number}${e.stepKey ? ` · ${e.stepKey}` : ''}`,
              icon: 'alert-circle',
              tone: 'danger',
            }))}
          />
        </Card>
      )}
    </div>
  );
}
