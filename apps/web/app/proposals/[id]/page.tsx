'use client';

import { use, useEffect, useState } from 'react';
import { fmtDateTime, OPERATION_LABELS, proposalLabel, type OperationType } from '@mao/shared';
import { ErrorBox, ExecLink, Loading, Status } from '@/components/common';
import { JsonField } from '@/components/catalog/forms';
import { Button } from '@/components/ui/core';
import { Card, Col, ConfirmDialog, DescriptionList, Grid, PageHeader, Tabs } from '@/components/ui/containers';
import { DiffView, JsonView } from '@/components/ui/data';
import { Alert, StatusBadge, Tag, useToast } from '@/components/ui/feedback';
import { FormField, LinesInput, Select, TextInput, Textarea } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';

const ACTION: Record<string, { label: string; verb: string; tone: 'success' | 'info' | 'danger' }> = {
  CREATE: { label: 'Crear', verb: 'Crear una capacidad nueva', tone: 'success' },
  UPDATE: { label: 'Modificar', verb: 'Modificar una capacidad existente (nueva versión)', tone: 'info' },
  CANCEL: { label: 'Cancelar', verb: 'Dejar de usar una capacidad existente', tone: 'danger' },
};

export default function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data: p, error, loading, reload } = useApi<any>(`/proposals/${id}`);
  const [tab, setTab] = useState('content');
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<any>(null);
  const [diff, setDiff] = useState<any>(null);
  const [cmp, setCmp] = useState({ from: 1, to: 1 });
  const [discard, setDiscard] = useState(false);
  const [submitted, setSubmitted] = useState<any>(null);
  const [confirmImplement, setConfirmImplement] = useState(false);

  useEffect(() => {
    if (p) {
      setDraft({ title: p.title, problem: p.problem, justification: p.justification, solution: p.solution, definition: p.definition, expectedImpact: p.expectedImpact, risks: p.risks, suggestedTests: p.suggestedTests });
      setCmp({ from: 1, to: p.revision });
    }
  }, [p]);

  if (loading && !p) return <Loading />;
  if (error && !p) return <ErrorBox error={error} onRetry={reload} />;
  if (!p || !draft) return <Loading />;
  const editable = p.status === 'DRAFT';
  const v = p.verification ?? { passed: false, errors: [], warnings: [] };
  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'success', title: ok });
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const applied = p.appliedVersionRef as any;
  const plan = p.plan as { hash: string; project: { key: string; name: string } | null; affectedAgents: string[]; notes: string[]; steps: { itemKey: string; group: string; operationType: OperationType; title: string }[] };
  // Estado de cada paso: de la solicitud abierta o, si no hay, de la última decidida.
  const lastRequest = p.openRequest ?? p.requests?.[0] ?? null;
  const stepStatus = (key: string) => lastRequest?.items?.find((i: any) => i.itemKey === key)?.status as string | undefined;
  const canImplement = plan.steps.length > 0 && (p.status !== 'DRAFT' || v.passed);
  const catalogPath = (kind: string) => (kind === 'agent' ? 'agents' : kind === 'skill' ? 'skills' : 'orchestrators');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${proposalLabel(p.number)} · ${p.title}`}
        status={<Status value={p.status} />}
        description={
          <>
            <StatusBadge size="sm" tone={ACTION[p.action]?.tone ?? 'neutral'}>
              {ACTION[p.action]?.label ?? p.action}
            </StatusBadge>{' '}
            {p.kind} <span className="fk-mono">{p.targetKey}</span> · creada por {p.createdBy} el {fmtDateTime(p.createdAt)}
            {p.sourceExecution && (
              <>
                {' '}
                en <ExecLink id={p.sourceExecution.id} number={p.sourceExecution.number} />
              </>
            )}{' '}
            · revisión {p.revision}
          </>
        }
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Propuestas', href: '/proposals' }, { label: proposalLabel(p.number) }]}
        actions={
          <>
            {editable && (
              <>
                <Button variant="secondary" size="sm" icon="x" onClick={() => setDiscard(true)}>
                  Descartar
                </Button>
                <Button variant="secondary" size="sm" icon="save" loading={busy} onClick={() => run(() => api.patch(`/proposals/${p.id}`, draft), 'Revisión guardada')}>
                  Guardar revisión
                </Button>
                <Button variant="secondary" size="sm" icon="shield" loading={busy} disabled={!v.passed} onClick={() => run(async () => setSubmitted(await api.post(`/proposals/${p.id}/submit`)), 'Enviada a aprobación')}>
                  Enviar a aprobación
                </Button>
              </>
            )}
            {plan.steps.length > 0 && (
              <Button size="sm" icon="check-circle" loading={busy} disabled={!canImplement} onClick={() => setConfirmImplement(true)}>
                Confirmar e implementar
              </Button>
            )}
          </>
        }
      />
      {submitted && (
        <Alert tone="info" title={`Solicitud AP-${submitted.number} creada`} actions={<Button size="sm" icon="shield" href={`/approvals/${submitted.id}`}>Revisar y aprobar</Button>}>
          Cada paso del plan se aprueba por separado. Cuando estén todos decididos se aplica lo aprobado.
        </Alert>
      )}
      {!submitted && p.openRequest && (
        <Alert tone="warning" title={`Solicitud AP-${p.openRequest.number} pendiente`} actions={<Button size="sm" variant="secondary" icon="shield" href={`/approvals/${p.openRequest.id}`}>Abrir solicitud</Button>}>
          Podés confirmar todo el plan desde acá con «Confirmar e implementar», o decidir cada paso en la solicitud.
        </Alert>
      )}
      {applied && (
        <Alert
          tone={p.status === 'APPLIED' ? 'success' : 'info'}
          title={p.status === 'APPLIED' ? 'Propuesta implementada' : 'Propuesta aprobada'}
          actions={<Button size="sm" variant="secondary" href={`/${catalogPath(applied.kind)}/${applied.key}`}>Abrir {applied.key}</Button>}
        >
          {applied.key} v{applied.version}
          {applied.activated ? ' está activa' : ' está aprobada pero sin activar'}
          {applied.assignedTo ? ` y agregada a las skills del proyecto ${applied.assignedTo}.` : applied.activated ? ' (sin asignar a un proyecto).' : '.'}
          {plan.steps.length > 0 ? ' Los pasos que faltan están en el plan de implementación.' : ''}
        </Alert>
      )}
      <Alert
        tone={v.passed ? 'success' : 'danger'}
        title={v.passed ? 'Verificación correcta' : 'La verificación encontró problemas'}
        actions={
          editable && !v.passed ? (
            <Button size="sm" variant="secondary" icon="sparkles" loading={busy} onClick={() => run(() => api.post(`/proposals/${p.id}/redesign`), 'Definición regenerada')}>
              Regenerar diseño
            </Button>
          ) : undefined
        }
      >
        {[...(v.errors ?? []), ...(v.warnings ?? [])].join(' · ') || 'Sin observaciones: no incluye código, comandos, dependencias ni permisos elevados.'}
        {editable && !v.passed && (
          <span className="block mt-1">«Regenerar diseño» le pide a CapabilityDesigner una definición nueva a partir del problema y la solución, con el modelo de la ejecución de origen (puede consumir tokens). También podés corregirla a mano en la pestaña Definición.</span>
        )}
      </Alert>
      <Card title="Qué propone y por qué" subtitle={ACTION[p.action]?.verb}>
        <div className="flex flex-col gap-2">
          <div className="fk-text">
            <b>Problema detectado:</b> {p.problem}
          </div>
          {p.justification && (
            <div className="fk-text fk-text--sm fk-text--muted">
              <b>Justificación:</b> {p.justification}
            </div>
          )}
          {p.evidence?.length > 0 && (
            <div>
              <div className="fk-field__label mb-1">Inconsistencias o brechas encontradas</div>
              <ul className="list-disc" style={{ paddingLeft: 20 }}>
                {p.evidence.map((e: string, i: number) => (
                  <li key={i} className="fk-text fk-text--sm">
                    {e}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Card>
      {(plan.steps.length > 0 || plan.notes.length > 0) && (
        <Card
          title="Plan de implementación"
          subtitle={
            plan.steps.length
              ? `Al confirmar se registra tu aprobación de cada paso, en este orden.${plan.project ? ` Proyecto de origen: ${plan.project.key} · ${plan.project.name}.` : ''}`
              : undefined
          }
        >
          <div className="flex flex-col gap-3">
            {plan.steps.length > 0 && (
              <ol className="flex flex-col gap-2" style={{ paddingLeft: 0, listStyle: 'none' }}>
                {plan.steps.map((s, i) => {
                  const st = stepStatus(s.itemKey);
                  return (
                    <li key={s.itemKey} className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                      <span className="fk-num fk-text--subtle">{i + 1}.</span>
                      <span className="fk-text flex-1" style={{ minWidth: 220 }}>
                        {s.title}
                      </span>
                      <Tag size="sm">{OPERATION_LABELS[s.operationType] ?? s.operationType}</Tag>
                      <StatusBadge size="sm" tone={st === 'APPROVED' ? 'success' : st === 'REJECTED' ? 'danger' : 'neutral'}>
                        {st === 'APPROVED' ? 'Aprobado' : st === 'REJECTED' ? 'Rechazado' : 'Pendiente'}
                      </StatusBadge>
                    </li>
                  );
                })}
              </ol>
            )}
            {plan.affectedAgents.length > 0 && (
              <p className="fk-text fk-text--sm fk-text--muted">
                Agentes de {plan.project?.key} que van a recibir la skill en las tareas que declara: {plan.affectedAgents.join(', ')}.
              </p>
            )}
            {plan.notes.map((n) => (
              <p key={n} className="fk-text fk-text--sm fk-text--subtle">
                {n}
              </p>
            ))}
          </div>
        </Card>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'content', label: 'Propuesta' },
          { value: 'definition', label: 'Definición' },
          { value: 'test', label: 'Probar' },
          { value: 'revisions', label: 'Revisiones', count: p.revisions.length },
        ]}
      />
      {tab === 'content' && (
        <Grid cols={12}>
          <Col span={8}>
            <Card title="Contenido">
              <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-4">
                <FormField label="Título">
                  <TextInput value={draft.title} onChange={(x) => setDraft({ ...draft, title: x })} />
                </FormField>
                <FormField label="Problema detectado">
                  <Textarea rows={3} value={draft.problem} onChange={(x) => setDraft({ ...draft, problem: x })} />
                </FormField>
                <FormField label="Justificación">
                  <Textarea rows={3} value={draft.justification} onChange={(x) => setDraft({ ...draft, justification: x })} />
                </FormField>
                <FormField label="Solución propuesta">
                  <Textarea rows={3} value={draft.solution} onChange={(x) => setDraft({ ...draft, solution: x })} />
                </FormField>
                <FormField label="Impacto esperado">
                  <Textarea rows={2} value={draft.expectedImpact} onChange={(x) => setDraft({ ...draft, expectedImpact: x })} />
                </FormField>
                <FormField label="Riesgos" hint="Uno por línea">
                  <LinesInput rows={3} value={draft.risks} onChange={(x) => setDraft({ ...draft, risks: x })} />
                </FormField>
                <FormField label="Pruebas sugeridas" hint="Una por línea">
                  <LinesInput rows={3} value={draft.suggestedTests} onChange={(x) => setDraft({ ...draft, suggestedTests: x })} />
                </FormField>
              </fieldset>
            </Card>
          </Col>
          <Col span={4}>
            <Card title="Permisos y herramientas">
              <DescriptionList
                columns={1}
                items={[
                  { label: 'Herramientas solicitadas', value: p.toolsRequested.length ? p.toolsRequested.join(', ') : 'Ninguna' },
                  { label: 'Permisos solicitados', value: p.permissionsRequested.length ? p.permissionsRequested.join(', ') : 'Ninguno' },
                  { label: 'Decidida por', value: p.decidedBy ? `${p.decidedBy} · ${fmtDateTime(p.decidedAt)}` : '—' },
                ]}
              />
            </Card>
          </Col>
        </Grid>
      )}
      {tab === 'definition' && (
        <Card title={`Definición completa (${p.kind})`} subtitle="Es solo datos: se valida con el mismo esquema que el catálogo.">
          {editable ? <JsonField value={draft.definition} onChange={(d) => setDraft({ ...draft, definition: d })} rows={28} /> : <JsonView value={p.definition} maxHeight={640} />}
        </Card>
      )}
      {tab === 'test' && (
        <Card title="Prueba sin efectos" actions={<Button size="sm" icon="zap" loading={busy} onClick={() => run(async () => setTest(await api.post(`/proposals/${p.id}/test`)), 'Prueba ejecutada')}>Probar</Button>}>
          {test ? (
            <div className="flex flex-col gap-3">
              <Alert tone={test.verification.passed ? 'success' : 'danger'} title="Verificación">
                {[...test.verification.errors, ...test.verification.warnings].join(' · ') || 'Correcta'}
              </Alert>
              {test.promptPreview && (
                <pre className="fk-mono max-h-[480px] overflow-auto whitespace-pre-wrap rounded-md bg-surface-subtle p-3" style={{ fontSize: 12 }}>
                  {test.promptPreview}
                </pre>
              )}
            </div>
          ) : (
            <p className="fk-text fk-text--muted">Verifica la definición y muestra cómo quedaría el prompt de un agente que la use.</p>
          )}
        </Card>
      )}
      {tab === 'revisions' && (
        <Card title="Revisiones">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <FormField label="Desde">
                <Select value={String(cmp.from)} onChange={(x) => setCmp({ ...cmp, from: Number(x) })} options={p.revisions.map((r: any) => ({ value: String(r.revision), label: `Revisión ${r.revision} · ${r.editedBy}` }))} />
              </FormField>
              <FormField label="Hasta">
                <Select value={String(cmp.to)} onChange={(x) => setCmp({ ...cmp, to: Number(x) })} options={p.revisions.map((r: any) => ({ value: String(r.revision), label: `Revisión ${r.revision} · ${r.editedBy}` }))} />
              </FormField>
              <Button variant="secondary" icon="columns" loading={busy} onClick={() => run(async () => setDiff(await api.get(`/proposals/${p.id}/diff?from=${cmp.from}&to=${cmp.to}`)), 'Comparación lista')}>
                Comparar
              </Button>
            </div>
            {diff && <DiffView lines={diff} maxHeight={520} />}
          </div>
        </Card>
      )}
      <ConfirmDialog
        open={confirmImplement}
        onClose={() => setConfirmImplement(false)}
        tone="info"
        title={`Implementar ${proposalLabel(p.number)}`}
        confirmLabel="Confirmar e implementar"
        loading={busy}
        message={
          <div className="flex flex-col gap-2">
            <span>Se registra tu aprobación individual de cada paso y el backend los ejecuta en orden:</span>
            <ol style={{ paddingLeft: 20 }} className="list-decimal">
              {plan.steps.map((s) => (
                <li key={s.itemKey}>{s.title}</li>
              ))}
            </ol>
            <span className="fk-text fk-text--sm fk-text--subtle">
              Plan <span className="fk-mono">{plan.hash.slice(0, 12)}</span>. Si algo cambió desde que lo abriste, no se aplica nada. Las ejecuciones en curso no se ven afectadas.
            </span>
          </div>
        }
        onConfirm={() =>
          run(async () => {
            await api.post(`/proposals/${p.id}/implement`, { confirmHash: plan.hash.slice(0, 12) });
            setConfirmImplement(false);
          }, 'Propuesta implementada')
        }
      />
      <ConfirmDialog
        open={discard}
        onClose={() => setDiscard(false)}
        tone="warning"
        title="Descartar propuesta"
        confirmLabel="Descartar propuesta"
        loading={busy}
        message="La propuesta queda rechazada y no se aplica al catálogo."
        onConfirm={() => run(async () => { await api.post(`/proposals/${p.id}/discard`, { comment: 'Descartada desde la interfaz' }); setDiscard(false); }, 'Propuesta descartada')}
      />
    </div>
  );
}
