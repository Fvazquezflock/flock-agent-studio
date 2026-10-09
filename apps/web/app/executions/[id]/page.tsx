'use client';

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { executionLabel, fmtDateTime, fmtDuration } from '@mao/shared';
import { ApprovalLink, ErrorBox, Loading, SimulationBanner, Status } from '@/components/common';
import { Button, Icon, cx } from '@/components/ui/core';
import { Card, Col, ConfirmDialog, DataTable, DescriptionList, Grid, PageHeader, Tabs } from '@/components/ui/containers';
import { FlowGraph, JsonView } from '@/components/ui/data';
import { Alert, StatusBadge, Tag, useToast } from '@/components/ui/feedback';
import { api, errorText, useApi, useEventStream } from '@/lib/api';
import { HANDLER_LABEL, SOURCE_LABEL } from '@/lib/labels';
import { COST_NOTE, UsageTable, UsageTotalsList, tokens, usd } from '@/components/usage';

const TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED'];

function dur(a?: string | null, b?: string | null) {
  if (!a) return '—';
  return fmtDuration((b ? new Date(b) : new Date()).getTime() - new Date(a).getTime());
}

export default function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data: ex, error, loading, reload } = useApi<any>(`/executions/${id}`);
  const running = ex ? !TERMINAL.includes(ex.status) : false;
  const { data: usage } = useApi<any>(ex ? `/executions/${ex.id}/usage` : null, { refreshMs: running ? 8000 : undefined });
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | undefined>();
  const [tab, setTab] = useState('output');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleReload = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void reload(true);
    }, 400);
  }, [reload]);

  const { connected } = useEventStream(ex ? `/executions/${ex.id}/stream` : null, (type, data) => {
    if (type === 'status') {
      scheduleReload();
      return;
    }
    setEvents((xs) => (xs.some((x) => x.id === data.id) ? xs : [...xs, data].slice(-400)));
    if (/^(STEP_|EXECUTION_|APPROVAL_|OPERATION_)/.test(type)) scheduleReload();
  });

  useEffect(() => {
    if (!selected && ex?.steps?.length) {
      const cur = ex.steps.find((s: any) => s.key === ex.currentStepKey) ?? ex.steps.find((s: any) => s.status !== 'COMPLETED') ?? ex.steps[ex.steps.length - 1];
      setSelected(cur.key);
    }
  }, [ex, selected]);

  const step = useMemo(() => ex?.steps.find((s: any) => s.key === selected), [ex, selected]);
  if (loading && !ex) return <Loading />;
  if (error && !ex) return <ErrorBox error={error} onRetry={reload} />;

  const openApprovals = ex.approvalRequests.filter((a: any) => ['PENDING', 'PARTIALLY_DECIDED'].includes(a.status));
  const out = ex.output as any;

  const act = async (kind: 'cancel' | 'retry') => {
    setBusy(true);
    try {
      await api.post(`/executions/${ex.id}/${kind}`);
      toast({ tone: 'success', title: kind === 'cancel' ? 'Cancelación solicitada' : 'Reintento solicitado' });
      setConfirmCancel(false);
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar la acción', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${executionLabel(ex.number)} · ${ex.orchestratorVersion.orchestrator.name}`}
        status={<Status value={ex.status} />}
        description={`Proyecto ${ex.project.key} · ${ex.orchestratorVersion.orchestrator.key} v${ex.orchestratorVersion.version} · origen ${SOURCE_LABEL[ex.source] ?? ex.source}`}
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ejecuciones', href: '/executions' }, { label: executionLabel(ex.number) }]}
        actions={
          <>
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => reload()}>
              Actualizar
            </Button>
            {ex.status === 'FAILED' && (
              <Button size="sm" icon="refresh" loading={busy} onClick={() => act('retry')}>
                Reintentar
              </Button>
            )}
            {!TERMINAL.includes(ex.status) && (
              <Button size="sm" variant="danger" icon="x-circle" onClick={() => setConfirmCancel(true)}>
                Cancelar ejecución
              </Button>
            )}
          </>
        }
      />
      <SimulationBanner simulation={ex.simulation} />
      {openApprovals.map((a: any) => (
        <Alert key={a.id} tone="warning" title={`Esperando tu aprobación: ${a.title}`} actions={<Button size="sm" icon="shield" href={`/approvals/${a.id}`}>Revisar y aprobar</Button>}>
          Nada se publica hasta que decidas. Solicitud <ApprovalLink id={a.id} number={a.number} />.
        </Alert>
      ))}
      {ex.error && (
        <Alert tone="danger" title={`Error ${ex.error.code}${ex.error.step ? ` en "${ex.error.step}"` : ''}`}>
          {ex.error.message}
        </Alert>
      )}
      <Grid cols={12}>
        <Col span={8}>
          <div className="flex flex-col gap-5">
            <Card title="Flujo" subtitle="Hacé clic en una etapa para ver su detalle. Las etapas en la misma fila corren en paralelo.">
              <FlowGraph nodes={ex.steps.map((s: any) => ({ key: s.key, name: s.name, handler: s.handler, agentKey: s.agentKey, dependsOn: s.dependsOn, status: s.status }))} selected={selected} onSelect={setSelected} />
            </Card>
            {step && (
              <Card
                title={step.name}
                subtitle={`${HANDLER_LABEL[step.handler] ?? step.handler}${step.agentKey ? ` · ${step.agentKey}` : ''}`}
                actions={<Status value={step.status} />}
              >
                <div className="flex flex-col gap-4">
                  <DescriptionList
                    columns={4}
                    items={[
                      { label: 'Intentos', value: `${step.attempt} de ${step.maxAttempts}` },
                      { label: 'Inicio', value: fmtDateTime(step.startedAt) },
                      { label: 'Duración', value: dur(step.startedAt, step.finishedAt) },
                      { label: 'Próximo reintento', value: step.nextRunAt ? fmtDateTime(step.nextRunAt) : '—' },
                    ]}
                  />
                  {step.error && (
                    <Alert tone={step.status === 'RETRYING' ? 'warning' : 'danger'} title={step.error.code}>
                      {step.error.message}
                    </Alert>
                  )}
                  <Tabs
                    value={tab}
                    onChange={setTab}
                    items={[
                      { value: 'output', label: 'Salida' },
                      { value: 'decisions', label: 'Decisiones y evidencias', count: Array.isArray(step.decisions) ? step.decisions.length : 0 },
                      { value: 'input', label: 'Entrada' },
                    ]}
                  />
                  {tab === 'output' && (step.output ? <JsonView value={step.output} /> : <p className="fk-text fk-text--muted">Todavía sin salida.</p>)}
                  {tab === 'decisions' &&
                    (Array.isArray(step.decisions) && step.decisions.length ? (
                      <div className="flex flex-col gap-2">
                        {step.decisions.map((d: any, i: number) => (
                          <div key={i} className="rounded-md border border-border p-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <b>{d.agentKey}</b> v{d.agentVersion} · tarea <span className="fk-mono">{d.task}</span>
                              {d.simulated ? <Tag size="sm">Simulado</Tag> : <Tag size="sm" variant="brand">{d.model}</Tag>}
                              <span className="fk-text fk-text--subtle">{d.durationMs} ms</span>
                            </div>
                            <div className="fk-text fk-text--sm fk-text--muted mt-1">
                              Skills: {d.skills?.length ? d.skills.map((s: any) => `${s.key} v${s.version}`).join(', ') : 'ninguna'} · proveedor {d.provider}
                              {d.usage && !d.simulated
                                ? ` · ${tokens((d.usage.inputTokens ?? 0) + (d.usage.outputTokens ?? 0) + (d.usage.cacheCreationInputTokens ?? 0) + (d.usage.cacheReadInputTokens ?? 0))} tokens (${tokens(d.usage.outputTokens)} de salida)${d.usage.costUsd ? ` · costo estimado ${usd(d.usage.costUsd)}` : ''}`
                                : ''}
                            </div>
                          </div>
                        ))}
                        <p className="fk-text fk-text--sm fk-text--subtle">Se registran versiones, skills y evidencias de cada decisión; nunca el razonamiento interno del modelo.</p>
                      </div>
                    ) : (
                      <p className="fk-text fk-text--muted">Esta etapa no invocó agentes.</p>
                    ))}
                  {tab === 'input' && <JsonView value={step.input ?? { dependsOn: step.dependsOn }} />}
                </div>
              </Card>
            )}
            {ex.operations.length > 0 && (
              <Card title="Operaciones externas" subtitle="Ejecutadas por el servicio de publicación (idempotentes y auditadas)" padding="none">
                <DataTable
                  compact
                  rows={ex.operations}
                  columns={[
                    { key: 'kind', header: 'Operación' },
                    { key: 'target', header: 'Destino', render: (r: any) => <span className="fk-mono">{r.target}</span> },
                    { key: 'mode', header: 'Modo', render: (r: any) => (r.mode === 'SIMULATED' ? <Tag size="sm">Simulada</Tag> : <Tag size="sm" variant="brand">Jira real</Tag>) },
                    { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
                    { key: 'key', header: 'Clave', render: (r: any) => <span className="fk-mono">{r.result?.key ?? '—'}</span> },
                    { key: 'attempts', header: 'Intentos', align: 'right' },
                  ]}
                />
              </Card>
            )}
            {out && (
              <Card title="Resultado">
                <DescriptionList
                  columns={3}
                  items={[
                    ...(out.stories !== undefined ? [{ label: 'Historias propuestas', value: out.stories }] : []),
                    ...(out.diagnosis ? [{ label: 'Diagnóstico de la HU', value: `${out.diagnosis.readiness} (${out.diagnosis.score}/100)` }] : []),
                    ...(out.improvements !== undefined ? [{ label: 'Mejoras propuestas', value: out.improvements }] : []),
                    { label: 'Tareas técnicas', value: out.tasks },
                    ...(out.validation ? [{ label: 'Validación QA', value: `${out.validation.verdict} · ${out.validation.issues} observaciones` }] : []),
                    ...(out.quality !== undefined ? [{ label: 'Calidad (supervisor)', value: `${out.quality}/100` }] : []),
                    ...(out.publication
                      ? [
                          {
                            label: 'Publicación',
                            value: out.publication.mode === 'DEMO' ? `${out.publication.simulated} simuladas (sin cambios en Jira)` : `${out.publication.succeeded} en Jira, ${out.publication.failed} fallidas`,
                          },
                        ]
                      : []),
                  ]}
                />
                {out.proposals?.filter((p: any) => p.number).length > 0 && (
                  <Alert tone="brand" title="El supervisor detectó capacidades faltantes" className="mt-3" actions={<Button size="sm" variant="inverse" href="/proposals">Ver propuestas</Button>}>
                    {out.proposals.filter((p: any) => p.number).map((p: any) => `CP-${p.number} ${p.targetKey}`).join(', ')} quedaron en borrador. Ninguna se activa sin tu aprobación.
                  </Alert>
                )}
              </Card>
            )}
            {usage && usage.totals.invocations > 0 && (
              <Card
                title="Consumo de tokens"
                subtitle={`Todas las invocaciones de modelos de esta ejecución, incluidos reintentos y respuestas fuera de contrato${usage.models.length ? ` · ${usage.models.join(', ')}` : ''}`}
              >
                <div className="flex flex-col gap-4">
                  <UsageTotalsList t={usage.totals} columns={3} />
                  <UsageTable rows={usage.byAgent} groupKey="agentKey" groupLabel="Agente" />
                  {usage.totals.simulated === usage.totals.invocations ? (
                    <p className="fk-text fk-text--sm fk-text--subtle">Ejecución simulada: el proveedor simulado no consume tokens.</p>
                  ) : (
                    <p className="fk-text fk-text--sm fk-text--subtle">{COST_NOTE}</p>
                  )}
                </div>
              </Card>
            )}
          </div>
        </Col>
        <Col span={4}>
          <div className="flex flex-col gap-5">
            <Card title="Datos">
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Identificador', value: <span className="fk-mono">{ex.id}</span> },
                  { label: 'Origen', value: SOURCE_LABEL[ex.source] ?? ex.source },
                  { label: 'Solicitado por', value: ex.requestedBy },
                  { label: 'Proveedor', value: `${ex.provider.name} (${ex.provider.kind})` },
                  { label: 'Creada', value: fmtDateTime(ex.createdAt) },
                  { label: 'Duración', value: dur(ex.startedAt, ex.finishedAt) },
                  { label: 'Entrada', value: <span className="fk-mono" style={{ fontSize: 12 }}>{JSON.stringify(ex.input)}</span> },
                  ...(ex.requestText ? [{ label: 'Pedido original', value: ex.requestText }] : []),
                  {
                    label: 'Versiones fijadas',
                    value: (
                      <span className="fk-text fk-text--sm">
                        Orquestador v{ex.snapshot.orchestrator.version} · config. proyecto v{ex.snapshot.projectConfig.version} · {ex.snapshot.agents.length} agentes · {ex.snapshot.skills.length} skills · {ex.snapshot.policies.length} políticas
                      </span>
                    ),
                  },
                ]}
              />
            </Card>
            <Card
              title="Eventos en vivo"
              actions={
                <StatusBadge tone={connected ? 'success' : 'warning'} size="sm">
                  {connected ? 'Conectado' : 'Reconectando'}
                </StatusBadge>
              }
            >
              <div className="flex max-h-[560px] flex-col gap-2 overflow-auto" aria-live="polite">
                {events.length === 0 && <p className="fk-text fk-text--muted">Esperando eventos…</p>}
                {[...events].reverse().map((e) => (
                  <div key={e.id} className="flex gap-2 text-[13px] leading-[18px]">
                    <Icon
                      name={e.level === 'error' ? 'x-circle' : e.level === 'warn' ? 'alert-triangle' : e.level === 'success' ? 'check-circle' : 'circle-dot'}
                      size={14}
                      className={cx(e.level === 'error' && 'text-danger', e.level === 'warn' && 'text-warning', e.level === 'success' && 'text-success', e.level === 'info' && 'text-ink-subtle')}
                      style={{ marginTop: 2, flex: 'none' }}
                    />
                    <div className="min-w-0">
                      <div className="text-ink">{e.message}</div>
                      <div className="fk-text--subtle text-[12px]">
                        {fmtDateTime(e.createdAt).slice(11)}
                        {e.stepKey ? ` · ${e.stepKey}` : ''} · <span className="fk-mono">{e.type}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </Col>
      </Grid>
      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => act('cancel')}
        loading={busy}
        tone="warning"
        title="Cancelar ejecución"
        confirmLabel="Cancelar ejecución"
        message="Las etapas pendientes se cancelan y las aprobaciones abiertas se cierran. Las operaciones ya publicadas no se revierten."
      />
    </div>
  );
}
