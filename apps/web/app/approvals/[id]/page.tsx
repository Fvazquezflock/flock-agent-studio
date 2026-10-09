'use client';

import Link from 'next/link';
import { use, useMemo, useState } from 'react';
import { approvalLabel, fmtDateTime, OPERATION_LABELS, type OperationType } from '@mao/shared';
import { ErrorBox, ExecLink, Loading, PolicyBadge, Status } from '@/components/common';
import { Button } from '@/components/ui/core';
import { Card, Modal, PageHeader, Timeline } from '@/components/ui/containers';
import { DiffView, JsonView, Markdown, diffText } from '@/components/ui/data';
import { Alert, StatusBadge, Tag, useToast } from '@/components/ui/feedback';
import { Checkbox, FormField, TextInput, Textarea } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';

const OPEN = ['PENDING', 'CONFLICT'];

const ACTION: Record<string, { label: string; tone: 'success' | 'info' | 'danger' }> = {
  CREATE: { label: 'Crear', tone: 'success' },
  UPDATE: { label: 'Modificar', tone: 'info' },
  CANCEL: { label: 'Cancelar', tone: 'danger' },
};
const CANCEL_REASON: Record<string, string> = { DUPLICATE: 'Duplicada', OUT_OF_SCOPE: 'Fuera del alcance de la épica', OBSOLETE: 'Obsoleta' };

/** Por qué se propone el ítem: motivo, inconsistencias encontradas por los agentes y evidencia verificable. */
function ItemWhy({ rationale }: { rationale: any }) {
  if (!rationale?.reason) return null;
  const inc: any[] = rationale.inconsistencies ?? [];
  const ev: string[] = rationale.evidence ?? [];
  return (
    <div className="mt-3 rounded-md bg-surface-subtle p-3">
      <div className="fk-text fk-text--sm">
        <b>Por qué:</b> {rationale.reason}
      </div>
      {inc.length > 0 && (
        <div className="mt-2">
          <div className="fk-field__label mb-1">Inconsistencias encontradas</div>
          <ul className="flex flex-col gap-1" style={{ paddingLeft: 0, listStyle: 'none' }}>
            {inc.map((p, i) => (
              <li key={p.id ?? i} className="fk-text fk-text--sm flex flex-wrap items-start gap-2">
                {p.severity && (
                  <StatusBadge size="sm" tone={p.severity === 'HIGH' ? 'danger' : p.severity === 'MEDIUM' ? 'warning' : 'neutral'}>
                    {p.severity === 'HIGH' ? 'Alta' : p.severity === 'MEDIUM' ? 'Media' : 'Baja'}
                  </StatusBadge>
                )}
                <span className="min-w-0 flex-1">
                  {p.description}
                  {p.evidence ? <span className="fk-text--subtle"> — {p.evidence}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {ev.length > 0 && <div className="fk-text fk-text--sm fk-text--subtle mt-2">Evidencia: {ev.join(' · ')}</div>}
    </div>
  );
}

function ItemContent({ item, editing, draft, setDraft, items }: { item: any; editing: boolean; draft: any; setDraft: (d: any) => void; items: any[] }) {
  const p = item.payload;
  const titleOf = (ref?: string) => items.find((i) => i.itemKey === ref)?.title ?? ref;
  if (item.operationType === 'CREATE_ISSUE') {
    return (
      <div className="flex flex-col gap-3">
        <div className="mao-kv fk-text fk-text--sm">
          <span className="text-ink-muted">Tipo de issue</span>
          <span>{p.issueType}</span>
          <span className="text-ink-muted">Proyecto</span>
          <span className="fk-mono">{p.projectKey}</span>
          <span className="text-ink-muted">Padre</span>
          <span>{p.parentKey ? <span className="fk-mono">{p.parentKey}</span> : p.parentRef ? `Se crea en esta solicitud: ${titleOf(p.parentRef)}` : '—'}</span>
        </div>
        {editing ? (
          <>
            <FormField label="Resumen" required>
              <TextInput value={draft.summary} onChange={(v) => setDraft({ ...draft, summary: v })} maxLength={255} />
            </FormField>
            <FormField label="Descripción" hint="Markdown">
              <Textarea rows={12} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
            </FormField>
          </>
        ) : (
          <div className="rounded-md border border-border bg-surface p-3">
            <div className="fk-h4 mb-1">{p.summary}</div>
            <Markdown text={p.description} />
          </div>
        )}
      </div>
    );
  }
  if (item.operationType === 'UPDATE_ISSUE') {
    const orig = item.original ?? {};
    return (
      <div className="flex flex-col gap-3">
        <div className="fk-text fk-text--sm text-ink-muted">
          Issue <span className="fk-mono text-ink">{p.issueKey}</span> · versión leída: <span className="fk-mono">{p.baseUpdated ?? '—'}</span>. Antes de escribir se compara con la versión actual de Jira.
        </div>
        {editing ? (
          <>
            {p.summary !== undefined && (
              <FormField label="Resumen propuesto">
                <TextInput value={draft.summary} onChange={(v) => setDraft({ ...draft, summary: v })} />
              </FormField>
            )}
            <FormField label="Descripción propuesta">
              <Textarea rows={14} value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
            </FormField>
          </>
        ) : (
          <>
            {p.summary !== undefined && (
              <div>
                <div className="fk-field__label mb-1">Resumen: original → propuesto</div>
                <DiffView lines={diffText(orig.summary ?? '', p.summary)} />
              </div>
            )}
            {p.description !== undefined && (
              <div>
                <div className="fk-field__label mb-1">Descripción: original → propuesta</div>
                <DiffView lines={diffText(orig.description ?? '', p.description)} />
              </div>
            )}
          </>
        )}
        {Array.isArray(p.meta?.justifications) && p.meta.justifications.length > 0 && (
          <div className="rounded-md bg-surface-subtle p-3">
            <div className="fk-field__label mb-1">Justificación de los cambios</div>
            <ul className="list-disc" style={{ paddingLeft: 20 }}>
              {p.meta.justifications.map((j: any, i: number) => (
                <li key={i} className="fk-text fk-text--sm">
                  <b>{j.field}</b>: {j.justification}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (item.operationType === 'TRANSITION_ISSUE') {
    return (
      <div className="flex flex-col gap-2">
        <div className="mao-kv fk-text fk-text--sm">
          <span className="text-ink-muted">Issue</span>
          <span className="fk-mono">{p.issueKey}</span>
          <span className="text-ink-muted">Motivo</span>
          <span>
            {CANCEL_REASON[p.reason] ?? p.reason}
            {p.duplicateOf ? (
              <>
                {' '}
                de <span className="fk-mono">{p.duplicateOf}</span>
              </>
            ) : null}
          </span>
          <span className="text-ink-muted">Transición en Jira</span>
          <span>{p.transitionId ? `${p.transitionName} (id ${p.transitionId})` : 'Sin mapear'}</span>
          <span className="text-ink-muted">Comentario en Jira</span>
          <span>{p.comment}</span>
        </div>
        {!p.transitionId && (
          <Alert tone="warning" title="Falta la transición de cancelación">
            Descubrí tipos y campos del proyecto y elegí la transición en Configuración → Proyectos → Jira. Sin ella, aunque lo apruebes, la cancelación no se ejecuta en Jira.
          </Alert>
        )}
      </div>
    );
  }
  if (item.operationType === 'CREATE_ISSUE_LINK') {
    const a = p.outwardKey ?? titleOf(p.outwardRef);
    const b = p.inwardKey ?? titleOf(p.inwardRef);
    return (
      <div className="fk-text fk-text--sm">
        <b>{a}</b> {p.linkType === 'Blocks' || /block/i.test(p.linkType) ? 'bloquea a' : 'se relaciona con'} <b>{b}</b> <Tag size="sm">{p.linkType}</Tag>
        {p.reason && <div className="text-ink-muted mt-1">{p.reason}</div>}
      </div>
    );
  }
  if (item.operationType.startsWith('ACTIVATE_')) {
    return (
      <div className="flex flex-col gap-2">
        <div className="fk-text fk-text--sm text-ink-muted">
          {item.original ? 'Diferencias contra la versión activa actual:' : 'Primera activación: no hay versión activa previa.'}
        </div>
        <DiffView lines={diffText(item.original ? JSON.stringify(item.original, null, 2) : '', JSON.stringify(p.definition, null, 2))} maxHeight={480} />
      </div>
    );
  }
  if (item.operationType === 'APPLY_CAPABILITY_PROPOSAL') {
    return (
      <div className="flex flex-col gap-2">
        <div className="fk-text fk-text--sm">
          Aprobar crea la versión <b>APROBADA (no activa)</b> de {p.kind} <span className="fk-mono">{p.targetKey}</span>. Activarla requiere otra aprobación.{' '}
          <Link className="fk-link" href={`/proposals/${p.proposalId}`}>
            Ver propuesta
          </Link>
        </div>
        <JsonView value={p.definition} maxHeight={360} />
      </div>
    );
  }
  return <JsonView value={p} />;
}

export default function ApprovalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const toast = useToast();
  const { data: req, error, loading, reload } = useApi<any>(`/approvals/${id}`);
  const [selected, setSelected] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [regen, setRegen] = useState(false);
  const [feedback, setFeedback] = useState('');

  const groups = useMemo(() => {
    const g = new Map<string, any[]>();
    for (const i of req?.items ?? []) g.set(i.group, [...(g.get(i.group) ?? []), i]);
    return [...g.entries()];
  }, [req]);

  if (loading && !req) return <Loading />;
  if (error && !req) return <ErrorBox error={error} onRetry={reload} />;

  const open = ['PENDING', 'PARTIALLY_DECIDED'].includes(req.status);
  const pendingItems = req.items.filter((i: any) => OPEN.includes(i.status));
  const batchable = pendingItems.filter((i: any) => i.policyMode !== 'ALWAYS_APPROVE');
  const selItems = req.items.filter((i: any) => selected.includes(i.id));
  const selHasIndividual = selItems.some((i: any) => i.policyMode === 'ALWAYS_APPROVE');
  const opsByItem = new Map(req.operations.map((o: any) => [o.approvalItemId, o]));

  const decide = async (approve: string[], reject: string[]) => {
    setBusy(true);
    try {
      const r = await api.post(`/approvals/${req.id}/decisions`, { approve, reject, comment, confirmHash: req.decisionHash.slice(0, 12) });
      toast({ tone: 'success', title: approve.length ? `${approve.length} ítem(s) aprobado(s)` : `${reject.length} ítem(s) rechazado(s)`, text: r.status === 'DECIDED' ? 'La solicitud quedó resuelta.' : undefined });
      setSelected([]);
      setComment('');
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se registró la decisión', text: errorText(e) });
      await reload(true);
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async (item: any) => {
    setBusy(true);
    try {
      await api.patch(`/approvals/${req.id}/items/${item.id}`, { payload: draft, note: 'Editado en la interfaz' });
      toast({ tone: 'success', title: 'Contenido actualizado', text: item.status === 'APPROVED' ? 'La aprobación previa se invalidó: hay que aprobarlo de nuevo.' : 'Se registró una nueva revisión.' });
      setEditing(null);
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo guardar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const doRegenerate = async () => {
    setBusy(true);
    try {
      await api.post(`/approvals/${req.id}/regenerate`, { feedback });
      toast({ tone: 'success', title: 'Regeneración solicitada', text: 'La ejecución vuelve a generar las propuestas con tu observación.' });
      setRegen(false);
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo regenerar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const closeReview = async () => {
    setBusy(true);
    try {
      await api.post(`/approvals/${req.id}/close`, { comment });
      toast({ tone: 'success', title: 'Revisión cerrada', text: 'Lo pendiente quedó rechazado y no se publica.' });
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo cerrar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const isExecutionRequest = !!req.executionId;
  const simulated = req.execution?.simulation?.jira === 'DEMO';

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={`${approvalLabel(req.number)} · ${req.title}`}
        status={<Status value={req.status} />}
        description={req.summary}
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Aprobaciones', href: '/approvals' }, { label: approvalLabel(req.number) }]}
        actions={req.execution ? <Button variant="secondary" size="sm" icon="zap" href={`/executions/${req.execution.id}`}>Ver ejecución EX-{req.execution.number}</Button> : undefined}
      />
      {simulated && (
        <Alert tone="warning" title="Proyecto de demostración">
          Aprobar no escribe en Jira: la publicación de esta ejecución es simulada y se registra como tal.
        </Alert>
      )}
      <Alert tone="info" title="Snapshot y confirmación">
        La solicitud conserva el snapshot original (<span className="fk-mono">{req.snapshotHash.slice(0, 12)}</span>). Tu decisión se registra sobre el contenido actual (<span className="fk-mono">{req.decisionHash.slice(0, 12)}</span>): si alguien lo cambia mientras revisás, la decisión se rechaza.
        {req.execution && (
          <>
            {' '}
            Ejecución <ExecLink id={req.execution.id} number={req.execution.number} />.
          </>
        )}
      </Alert>

      {groups.map(([group, items]) => (
        <Card
          key={group}
          title={group}
          subtitle={`${items.length} ítem(s)`}
          actions={
            open && items.some((i: any) => OPEN.includes(i.status) && i.policyMode !== 'ALWAYS_APPROVE') ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const ids = items.filter((i: any) => OPEN.includes(i.status) && i.policyMode !== 'ALWAYS_APPROVE').map((i: any) => i.id);
                  const all = ids.every((x: string) => selected.includes(x));
                  setSelected((s) => (all ? s.filter((x) => !ids.includes(x)) : [...new Set([...s, ...ids])]));
                }}
              >
                Seleccionar aprobables por lote
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3">
            {items.map((item: any) => {
              const op = opsByItem.get(item.id) as any;
              const isEditing = editing === item.id;
              const canEdit = open && ['CREATE_ISSUE', 'UPDATE_ISSUE'].includes(item.operationType) && ['PENDING', 'APPROVED', 'CONFLICT'].includes(item.status);
              return (
                <div key={item.id} className="rounded-lg border border-border p-4" style={{ background: selected.includes(item.id) ? 'var(--primary-subtle)' : 'var(--surface)' }}>
                  <div className="flex flex-wrap items-start gap-3">
                    {open && OPEN.includes(item.status) && (
                      <Checkbox checked={selected.includes(item.id)} onChange={(c) => setSelected((s) => (c ? [...s, item.id] : s.filter((x) => x !== item.id)))} />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="fk-h4" style={{ overflowWrap: 'anywhere' }}>
                        {item.title}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {item.action && ACTION[item.action] && (
                          <StatusBadge size="sm" tone={ACTION[item.action].tone}>
                            {ACTION[item.action].label}
                          </StatusBadge>
                        )}
                        <Tag size="sm">{OPERATION_LABELS[item.operationType as OperationType] ?? item.operationType}</Tag>
                        <PolicyBadge mode={item.policyMode} />
                        <Status value={item.status} size="sm" />
                        <span className="fk-text fk-text--sm fk-text--subtle">
                          revisión {item.revision} · <span className="fk-mono">{item.itemKey}</span>
                        </span>
                        {op && <Tag size="sm" variant={op.mode === 'LIVE' ? 'brand' : undefined}>{op.status === 'SIMULATED' ? `Simulada ${op.result?.key ?? ''}` : `${op.status} ${op.result?.key ?? ''}`}</Tag>}
                      </div>
                      {item.dependsOn.length > 0 && <div className="fk-text fk-text--sm fk-text--subtle mt-1">Depende de: {item.dependsOn.join(', ')}</div>}
                      <ItemWhy rationale={item.rationale} />
                    </div>
                    <div className="flex gap-2">
                      {canEdit && !isEditing && (
                        <Button
                          size="sm"
                          variant="secondary"
                          icon="edit"
                          onClick={() => {
                            setEditing(item.id);
                            setDraft({ summary: item.payload.summary ?? '', description: item.payload.description ?? '' });
                          }}
                        >
                          Editar
                        </Button>
                      )}
                      {open && OPEN.includes(item.status) && item.policyMode === 'ALWAYS_APPROVE' && (
                        <Button size="sm" icon="check" loading={busy} onClick={() => decide([item.id], [])}>
                          Aprobar este ítem
                        </Button>
                      )}
                    </div>
                  </div>
                  {item.note && <div className="fk-text fk-text--sm mt-2 text-warning">{item.note}</div>}
                  <div className="mt-3">
                    <ItemContent item={item} editing={isEditing} draft={draft} setDraft={setDraft} items={req.items} />
                  </div>
                  {isEditing && (
                    <div className="mt-3 flex justify-end gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                        Descartar cambios
                      </Button>
                      <Button size="sm" icon="save" loading={busy} onClick={() => saveEdit(item)}>
                        Guardar revisión
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {req.decisions.length > 0 && (
        <Card title="Historial de decisiones">
          <Timeline
            items={req.decisions.map((d: any) => ({
              title: `${d.decision === 'POLICY' ? 'Decisión automática por política' : d.decision === 'REGENERATE' ? 'Rechazada para regenerar' : `Decisión ${d.decision}`} · ${(d.items as any[]).length} ítem(s)`,
              meta: `${fmtDateTime(d.createdAt)} · ${d.approver} · canal ${d.channel}`,
              content: d.comment || undefined,
              icon: d.decision === 'REJECT' || d.decision === 'REGENERATE' ? 'x-circle' : 'check-circle',
              tone: d.decision === 'REJECT' ? 'danger' : d.decision === 'REGENERATE' ? 'warning' : 'success',
            }))}
          />
        </Card>
      )}

      {open && (
        <div className="sticky bottom-0 z-30 rounded-lg border border-border bg-surface-raised p-4 shadow-overlay">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[260px] flex-1">
              <FormField label={`Comentario (${selected.length} seleccionado/s · ${pendingItems.length} pendiente/s)`}>
                <TextInput value={comment} onChange={setComment} placeholder="Opcional: queda registrado en la auditoría" />
              </FormField>
            </div>
            <Button
              icon="check"
              loading={busy}
              disabled={!selected.length || (selHasIndividual && selected.length > 1)}
              title={selHasIndividual && selected.length > 1 ? 'Hay ítems que requieren aprobación individual' : undefined}
              onClick={() => decide(selected, [])}
            >
              Aprobar seleccionados
            </Button>
            <Button variant="secondary" icon="x" loading={busy} disabled={!selected.length} onClick={() => decide([], selected)}>
              Rechazar seleccionados
            </Button>
            {isExecutionRequest && req.kind !== 'conflict_review' && (
              <Button variant="secondary" icon="refresh" onClick={() => setRegen(true)}>
                Rechazar y regenerar
              </Button>
            )}
            <Button variant="ghost" onClick={closeReview} loading={busy}>
              Cerrar revisión
            </Button>
          </div>
          {selHasIndividual && selected.length > 1 && <p className="fk-text fk-text--sm mt-2 text-warning">Los ítems con aprobación individual se aprueban de a uno (botón en cada ítem).</p>}
          {!selected.length && batchable.length > 0 && <p className="fk-text fk-text--sm fk-text--subtle mt-2">Seleccioná ítems para decidir. {batchable.length} admiten aprobación por lote.</p>}
        </div>
      )}

      <Modal
        open={regen}
        onClose={() => setRegen(false)}
        title="Rechazar y regenerar"
        description="La solicitud queda reemplazada y los agentes vuelven a generar las propuestas considerando tu observación."
        footer={
          <>
            <Button variant="secondary" onClick={() => setRegen(false)}>
              Cancelar
            </Button>
            <Button icon="refresh" loading={busy} disabled={feedback.trim().length < 3} onClick={doRegenerate}>
              Regenerar propuestas
            </Button>
          </>
        }
      >
        <FormField label="Observación para los agentes" required>
          <Textarea rows={4} value={feedback} onChange={setFeedback} placeholder="Por ejemplo: agregá criterios de auditoría y separá la historia del panel en dos." />
        </FormField>
      </Modal>
    </div>
  );
}
