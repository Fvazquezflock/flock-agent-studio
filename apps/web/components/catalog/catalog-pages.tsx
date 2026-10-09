'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { approvalLabel, fmtDateTime, TASK_TYPES, TASK_CONTRACTS } from '@mao/shared';
import { ErrorBox, Loading, Status } from '@/components/common';
import { Button } from '@/components/ui/core';
import { Card, Col, ConfirmDialog, DataTable, Grid, Modal, PageHeader, Tabs } from '@/components/ui/containers';
import { DiffView, FlowGraph, JsonView } from '@/components/ui/data';
import { Alert, EmptyState, Tag, useToast } from '@/components/ui/feedback';
import { FormField, Select, TextInput } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';
import { KIND_LABEL, catalogFilePath } from '@/lib/labels';
import { AgentForm, JsonField, OrchestratorForm, SkillForm } from './forms';

export type Kind = 'agent' | 'skill' | 'orchestrator';

const TEMPLATES: Record<Kind, Record<string, unknown>> = {
  agent: { name: 'Nuevo agente', description: '', objective: '', systemPrompt: 'Describí el rol del agente.', tasks: [], skills: [], allowedTools: [] },
  skill: { name: 'Nueva skill', description: '', instructions: '# Nueva skill\n\nDescribí cuándo y cómo usarla.', rules: [] },
  orchestrator: {
    name: 'Nuevo orquestador',
    objective: 'Describí el objetivo del flujo.',
    keywords: [],
    inputSchema: { fields: [{ key: 'storyKey', label: 'Clave de la historia', type: 'issueKey', required: true }] },
    steps: [
      { key: 'context', name: 'Contexto', handler: 'jira.context', agentKey: 'JiraContextAnalyzer', params: { mode: 'story' } },
      { key: 'review_story', name: 'Validación funcional', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'story_review', dependsOn: ['context'] },
    ],
  },
};

const DESCRIPTIONS: Record<Kind, string> = {
  agent: 'Agentes y subagentes versionados. Cada ejecución fija la versión exacta usada; activar una versión requiere aprobación.',
  skill: 'Instrucciones, reglas, plantillas y ejemplos reutilizables. Se cargan solo para las tareas donde aplican.',
  orchestrator: 'Flujos declarativos (grafos acíclicos) versionados en archivos del repo y en la base de datos. Las etapas sin dependencias entre sí corren en paralelo.',
};

export function CatalogList({ kind }: { kind: Kind }) {
  const router = useRouter();
  const toast = useToast();
  const meta = KIND_LABEL[kind];
  const { data, error, loading, reload } = useApi<any[]>(`/${meta.path}`);
  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    try {
      await api.post(`/${meta.path}`, { key, definition: TEMPLATES[kind], changeNote: 'Versión inicial (borrador)' });
      toast({ tone: 'success', title: `${meta.singular} ${key} creado como borrador` });
      router.push(`/${meta.path}/${key}`);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo crear', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const supervisor = kind === 'agent' ? data?.find((a) => a.key === 'MainSupervisor') : undefined;
  const delegates: string[] = supervisor?.activeVersion?.definition?.delegates ?? [];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={meta.plural}
        description={DESCRIPTIONS[kind]}
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: meta.plural }]}
        actions={
          <Button icon="plus" onClick={() => setCreating(true)}>
            Nuevo {meta.singular.toLowerCase()}
          </Button>
        }
      />
      <ErrorBox error={error} onRetry={reload} />
      {kind === 'agent' && supervisor && (
        <Card title="Jerarquía de delegación" subtitle="El supervisor principal coordina y delega en los agentes especialistas.">
          <FlowGraph
            nodes={[
              { key: supervisor.key, name: supervisor.name, handler: 'supervisor.review', agentKey: supervisor.key, dependsOn: [] },
              ...delegates.map((d) => {
                const a = data!.find((x) => x.key === d);
                return { key: d, name: a?.name ?? d, handler: 'agent.task', agentKey: d, dependsOn: [supervisor.key], status: a?.status === 'ACTIVE' ? undefined : 'SKIPPED' };
              }),
            ]}
            onSelect={(k) => router.push(`/agents/${k}`)}
          />
        </Card>
      )}
      <DataTable
        loading={loading && !data}
        rows={data ?? []}
        rowKey="key"
        onRowClick={(r) => router.push(`/${meta.path}/${r.key}`)}
        empty={<EmptyState compact title={`No hay ${meta.plural.toLowerCase()}`} />}
        columns={[
          { key: 'key', header: 'Clave', render: (r: any) => <span className="fk-mono">{r.key}</span> },
          { key: 'name', header: 'Nombre', wrap: true },
          { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
          { key: 'active', header: 'Versión activa', render: (r: any) => (r.activeVersion ? `v${r.activeVersion.version}` : '—') },
          { key: 'latest', header: 'Última versión', render: (r: any) => (r.latestVersion ? <span className="flex items-center gap-2">v{r.latestVersion.version} <Status value={r.latestVersion.status} size="sm" /></span> : '—') },
          {
            key: 'extra',
            header: kind === 'agent' ? 'Tareas' : kind === 'orchestrator' ? 'Etapas' : 'Aplica a',
            wrap: true,
            render: (r: any) => {
              const d = r.activeVersion?.definition;
              if (!d) return '—';
              if (kind === 'agent') return (d.tasks ?? []).join(', ');
              if (kind === 'orchestrator') return `${d.steps.length} etapas`;
              return (d.appliesTo?.tasks ?? []).length ? d.appliesTo.tasks.join(', ') : 'todas las tareas';
            },
          },
          { key: 'updatedAt', header: 'Actualizado', render: (r: any) => <span className="fk-num">{fmtDateTime(r.updatedAt)}</span> },
        ]}
      />
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title={`Nuevo ${meta.singular.toLowerCase()}`}
        description="Se crea como borrador. Para usarlo hay que solicitar su activación y aprobarla."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button icon="plus" loading={busy} disabled={!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(key)} onClick={create}>
              Crear borrador
            </Button>
          </>
        }
      >
        <FormField label="Clave" required hint="Letras, números, guion o guion bajo. No se puede cambiar después.">
          <TextInput mono value={key} onChange={setKey} placeholder={kind === 'orchestrator' ? 'MI_FLUJO' : 'MiAgente'} />
        </FormField>
      </Modal>
    </div>
  );
}

export function CatalogDetail({ kind, entityKey }: { kind: Kind; entityKey: string }) {
  const router = useRouter();
  const toast = useToast();
  const meta = KIND_LABEL[kind];
  const { data: entity, error, loading, reload } = useApi<any>(`/${meta.path}/${entityKey}`);
  const { data: agents } = useApi<any[]>('/agents');
  const { data: skills } = useApi<any[]>('/skills');
  const { data: providers } = useApi<any[]>('/providers');
  const [version, setVersion] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, any> | null>(null);
  const [tab, setTab] = useState('form');
  const [busy, setBusy] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [test, setTest] = useState<any>(null);
  const [testProvider, setTestProvider] = useState('mock');
  const [testTask, setTestTask] = useState('');
  const [cmp, setCmp] = useState<{ from: number; to: number } | null>(null);
  const [diff, setDiff] = useState<any>(null);
  const [dup, setDup] = useState(false);
  const [dupKey, setDupKey] = useState('');
  const [confirmDeact, setConfirmDeact] = useState(false);
  const [activation, setActivation] = useState<any>(null);

  useEffect(() => {
    if (entity && version === null) setVersion(entity.versions[0]?.version ?? null);
  }, [entity, version]);
  const v = useMemo(() => entity?.versions.find((x: any) => x.version === version), [entity, version]);
  useEffect(() => {
    if (v) {
      setDraft(structuredClone(v.definition));
      setValidation(null);
      setTest(null);
    }
  }, [v]);

  if (loading && !entity) return <Loading />;
  if (error && !entity) return <ErrorBox error={error} onRetry={reload} />;
  if (!entity || !v || !draft) return <Loading />;

  const readOnly = v.status !== 'DRAFT';
  const dirty = JSON.stringify(draft) !== JSON.stringify(v.definition);
  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ tone: 'success', title: ok });
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      await api.put(`/${meta.path}/${entityKey}/versions/${v.version}`, { definition: draft, changeNote: v.changeNote });
      await reload(true);
    }, 'Borrador guardado');
  const newDraft = () =>
    run(async () => {
      const r = await api.post(`/${meta.path}/${entityKey}/versions`, { definition: draft, changeNote: `Basado en v${v.version}` });
      await reload(true);
      setVersion(r.version.version);
    }, 'Nuevo borrador creado');
  const validate = () =>
    run(async () => {
      setValidation(await api.post(`/${meta.path}/validate`, { definition: draft, key: entityKey }));
    });
  const requestActivation = () =>
    run(async () => {
      if (dirty && !readOnly) await api.put(`/${meta.path}/${entityKey}/versions/${v.version}`, { definition: draft, changeNote: v.changeNote });
      const r = await api.post(`/${meta.path}/${entityKey}/versions/${v.version}/activate`);
      setActivation(r);
      await reload(true);
    }, 'Activación solicitada: aprobala para que tenga efecto');
  const doTest = () =>
    run(async () => {
      setTest(await api.post(`/${meta.path}/${entityKey}/versions/${v.version}/test`, { providerKey: testProvider || undefined, task: testTask || undefined }));
    });
  const doDiff = (from: number, to: number) =>
    run(async () => {
      setCmp({ from, to });
      setDiff(await api.get(`/${meta.path}/${entityKey}/diff?from=${from}&to=${to}`));
    });

  const catalog = { agents: agents ?? [], skills: skills ?? [] };
  const Form = kind === 'agent' ? AgentForm : kind === 'skill' ? SkillForm : OrchestratorForm;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={entity.name}
        status={<Status value={entity.status} />}
        description={
          <>
            <span className="fk-mono">{entity.key}</span> · {entity.activeVersion ? `versión activa v${entity.activeVersion.version}` : 'sin versión activa'} · {entity.description}
            <br />
            Archivo{' '}
            <Link className="fk-link fk-mono" href="/files" title="Estado de los archivos del catálogo">
              {catalogFilePath(kind, entity.key)}
            </Link>
          </>
        }
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: meta.plural, href: `/${meta.path}` }, { label: entity.key }]}
        actions={
          <>
            <Button variant="secondary" size="sm" icon="copy" onClick={() => setDup(true)}>
              Duplicar
            </Button>
            {entity.status === 'ACTIVE' && (
              <Button variant="secondary" size="sm" icon="eye-off" onClick={() => setConfirmDeact(true)}>
                Desactivar
              </Button>
            )}
          </>
        }
      />
      {activation && (
        <Alert tone="info" title={`Solicitud ${approvalLabel(activation.number)} creada`} actions={<Button size="sm" icon="shield" href={`/approvals/${activation.id}`}>Revisar y aprobar</Button>}>
          La versión queda en aprobación. Las ejecuciones en curso siguen usando la versión que tenían fijada.
        </Alert>
      )}
      <Grid cols={12}>
        <Col span={3}>
          <Card title="Versiones" padding="default">
            <div className="flex flex-col gap-2">
              {entity.versions.map((x: any) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setVersion(x.version)}
                  className="rounded-md border p-3 text-left"
                  style={{ borderColor: x.version === version ? 'var(--primary)' : 'var(--border)', background: x.version === version ? 'var(--primary-subtle)' : 'var(--surface)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <b>v{x.version}</b>
                    <Status value={x.status} size="sm" />
                  </div>
                  <div className="fk-text fk-text--sm fk-text--subtle mt-1">{fmtDateTime(x.createdAt)} · {x.createdBy}</div>
                  {x.changeNote && <div className="fk-text fk-text--sm mt-1">{x.changeNote}</div>}
                  {x.sourceProposalId && <Tag size="sm">Desde propuesta</Tag>}
                </button>
              ))}
            </div>
          </Card>
        </Col>
        <Col span={9}>
          <Card
            title={`v${v.version} · ${readOnly ? 'solo lectura' : 'borrador editable'}`}
            subtitle={`Checksum ${v.checksum.slice(0, 12)}${v.approvedBy ? ` · aprobada por ${v.approvedBy}` : ''}${v.activatedAt ? ` · activada ${fmtDateTime(v.activatedAt)}` : ''}`}
            actions={
              <div className="flex flex-wrap gap-2">
                {readOnly ? (
                  <Button size="sm" variant="secondary" icon="edit" loading={busy} onClick={newDraft}>
                    Nuevo borrador desde esta versión
                  </Button>
                ) : (
                  <Button size="sm" variant="secondary" icon="save" loading={busy} disabled={!dirty} onClick={save}>
                    Guardar borrador
                  </Button>
                )}
                <Button size="sm" variant="secondary" icon="check-circle" loading={busy} onClick={validate}>
                  Validar
                </Button>
                {['DRAFT', 'APPROVED', 'INACTIVE'].includes(v.status) && (
                  <Button size="sm" icon="shield" loading={busy} onClick={requestActivation}>
                    Solicitar activación
                  </Button>
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-4">
              {readOnly && v.status !== 'ACTIVE' && (
                <Alert tone="info">
                  Esta versión está {v.status === 'PENDING_APPROVAL' ? 'en aprobación' : v.status.toLowerCase()}. Las versiones solo se editan como borrador; creá uno nuevo para cambiarla.
                </Alert>
              )}
              {validation && (
                <Alert tone={validation.valid ? (validation.warnings.length ? 'warning' : 'success') : 'danger'} title={validation.valid ? 'Definición válida' : 'La definición tiene errores'}>
                  {[...validation.errors, ...validation.warnings].join(' · ') || 'Sin observaciones.'}
                  {validation.layers && ` Capas: ${validation.layers.map((l: string[]) => `[${l.join(', ')}]`).join(' → ')}`}
                </Alert>
              )}
              <Tabs
                value={tab}
                onChange={setTab}
                items={[
                  { value: 'form', label: 'Formulario' },
                  { value: 'json', label: 'JSON' },
                  { value: 'test', label: 'Probar' },
                  { value: 'diff', label: 'Comparar versiones' },
                ]}
              />
              {tab === 'form' && <Form def={draft} set={setDraft} readOnly={readOnly} catalog={catalog} />}
              {tab === 'json' && (readOnly ? <JsonView value={draft} maxHeight={640} /> : <JsonField value={draft} onChange={setDraft} rows={28} />)}
              {tab === 'test' && (
                <div className="flex flex-col gap-3">
                  <p className="fk-text fk-text--muted">
                    {kind === 'agent'
                      ? 'Invoca esta versión (aunque sea borrador) con datos del proyecto demo, sin activarla y sin escribir nada.'
                      : 'Valida la definición y muestra el prompt compuesto resultante.'}
                  </p>
                  {kind === 'agent' && (
                    <div className="flex flex-wrap items-end gap-3">
                      <FormField label="Proveedor">
                        <Select value={testProvider} onChange={setTestProvider} options={(providers ?? []).map((p) => ({ value: p.key, label: `${p.name} (${p.status})` }))} />
                      </FormField>
                      <FormField label="Tarea">
                        <Select value={testTask} onChange={setTestTask} placeholder="Primera tarea declarada" options={(draft.tasks ?? TASK_TYPES).map((t: string) => ({ value: t, label: TASK_CONTRACTS[t as keyof typeof TASK_CONTRACTS]?.label ?? t }))} />
                      </FormField>
                    </div>
                  )}
                  <div>
                    <Button icon="zap" loading={busy} onClick={doTest} disabled={dirty && !readOnly}>
                      Probar v{v.version}
                    </Button>
                    {dirty && !readOnly && <span className="fk-text fk-text--sm fk-text--subtle ml-3">Guardá el borrador antes de probar.</span>}
                  </div>
                  {test && (
                    <div className="flex flex-col gap-3">
                      <Alert tone={test.validation.valid ? 'success' : 'danger'} title={test.validation.valid ? 'Validación correcta' : 'Validación con errores'}>
                        {[...test.validation.errors, ...test.validation.warnings].join(' · ') || 'Sin observaciones.'}
                      </Alert>
                      {test.run && (
                        <Alert tone={test.run.ok ? (test.run.meta?.simulated ? 'warning' : 'success') : 'danger'} title={test.run.ok ? `Invocación OK (${test.run.meta.simulated ? 'simulada' : test.run.meta.model}, ${test.run.meta.durationMs} ms)` : `Falló: ${test.run.error.code}`}>
                          {test.run.ok ? 'La salida cumple el contrato de la tarea.' : test.run.error.message}
                        </Alert>
                      )}
                      {test.run?.ok && <JsonView value={test.run.output} maxHeight={360} />}
                      {test.promptPreview && (
                        <details>
                          <summary className="fk-link cursor-pointer">Prompt de sistema compuesto</summary>
                          <pre className="fk-mono mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-surface-subtle p-3" style={{ fontSize: 12 }}>
                            {test.promptPreview}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )}
              {tab === 'diff' && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <FormField label="Desde">
                      <Select value={String(cmp?.from ?? entity.versions[entity.versions.length - 1].version)} onChange={(x) => setCmp({ from: Number(x), to: cmp?.to ?? v.version })} options={entity.versions.map((x: any) => ({ value: String(x.version), label: `v${x.version} (${x.status})` }))} />
                    </FormField>
                    <FormField label="Hasta">
                      <Select value={String(cmp?.to ?? v.version)} onChange={(x) => setCmp({ from: cmp?.from ?? entity.versions[entity.versions.length - 1].version, to: Number(x) })} options={entity.versions.map((x: any) => ({ value: String(x.version), label: `v${x.version} (${x.status})` }))} />
                    </FormField>
                    <Button variant="secondary" icon="columns" loading={busy} onClick={() => doDiff(cmp?.from ?? entity.versions[entity.versions.length - 1].version, cmp?.to ?? v.version)}>
                      Comparar
                    </Button>
                    {readOnly && (
                      <Button variant="ghost" icon="refresh" loading={busy} onClick={() => run(async () => { const r = await api.post(`/${meta.path}/${entityKey}/versions/${v.version}/restore`); await reload(true); setVersion(r.version.version); }, `Borrador creado a partir de v${v.version}`)}>
                        Restaurar v{v.version} como borrador
                      </Button>
                    )}
                  </div>
                  {diff && <DiffView lines={diff.lines} maxHeight={560} />}
                </div>
              )}
            </div>
          </Card>
        </Col>
      </Grid>
      <Modal
        open={dup}
        onClose={() => setDup(false)}
        title={`Duplicar ${entity.key}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDup(false)}>
              Cancelar
            </Button>
            <Button icon="copy" loading={busy} disabled={!/^[A-Za-z][A-Za-z0-9_-]{1,63}$/.test(dupKey)} onClick={() => run(async () => { await api.post(`/${meta.path}/${entityKey}/duplicate`, { newKey: dupKey }); router.push(`/${meta.path}/${dupKey}`); }, 'Copia creada como borrador')}>
              Duplicar
            </Button>
          </>
        }
      >
        <FormField label="Nueva clave" required>
          <TextInput mono value={dupKey} onChange={setDupKey} />
        </FormField>
      </Modal>
      <ConfirmDialog
        open={confirmDeact}
        onClose={() => setConfirmDeact(false)}
        tone="warning"
        title={`Desactivar ${entity.key}`}
        confirmLabel="Desactivar"
        loading={busy}
        message="Deja de estar disponible para nuevas ejecuciones. Las ejecuciones existentes conservan la versión que tenían fijada."
        onConfirm={() => run(async () => { await api.post(`/${meta.path}/${entityKey}/deactivate`); setConfirmDeact(false); await reload(true); }, 'Desactivado')}
      />
    </div>
  );
}
