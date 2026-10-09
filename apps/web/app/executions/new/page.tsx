'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { ErrorBox, Loading } from '@/components/common';
import { Button, TextLink } from '@/components/ui/core';
import { Card, Col, Grid, PageHeader } from '@/components/ui/containers';
import { Alert, useToast } from '@/components/ui/feedback';
import { FormField, SegmentedControl, Select, TextInput, Textarea } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';

/** Parámetros que no son entrada del orquestador (el resto, p. ej. epicKey o storyKey, precarga la entrada). */
const RESERVED_PARAMS = ['project', 'orchestrator', 'provider', 'from'];

export default function NewExecutionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewExecutionForm />
    </Suspense>
  );
}

function NewExecutionForm() {
  const router = useRouter();
  const toast = useToast();
  const sp = useSearchParams();
  const fromBacklog = sp.get('from') === 'backlog';
  const [mode, setMode] = useState<'form' | 'ask'>('form');
  const { data: projects, error: pErr } = useApi<any[]>('/projects');
  const { data: orchestrators, error: oErr } = useApi<any[]>('/orchestrators');
  const { data: providers } = useApi<any[]>('/providers');
  const [projectKey, setProjectKey] = useState(sp.get('project') ?? '');
  const [orchKey, setOrchKey] = useState(sp.get('orchestrator') ?? '');
  const [providerKey, setProviderKey] = useState(sp.get('provider') ?? '');
  const [input, setInput] = useState<Record<string, string>>(() => Object.fromEntries([...sp.entries()].filter(([k]) => !RESERVED_PARAMS.includes(k))));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [plan, setPlan] = useState<any>(null);

  useEffect(() => {
    if (!projectKey && projects?.length) setProjectKey(projects[0].key);
  }, [projects, projectKey]);
  const active = (orchestrators ?? []).filter((o) => o.status === 'ACTIVE' && o.activeVersion);
  useEffect(() => {
    if (!orchKey && active.length) setOrchKey(active[0].key);
  }, [active, orchKey]);
  const def = useMemo(() => active.find((o) => o.key === orchKey)?.activeVersion?.definition, [active, orchKey]);
  const project = projects?.find((p) => p.key === projectKey);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const ex = await api.post('/executions', { projectKey, orchestratorKey: orchKey, input, providerKey: providerKey || undefined, source: 'UI' });
      toast({ tone: 'success', title: `Ejecución EX-${ex.number} creada` });
      router.push(`/executions/${ex.id}`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  const ask = async (execute: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (!execute) {
        setPlan(await api.post('/supervisor/plan', { text, projectKey: projectKey || undefined, providerKey: providerKey || undefined }));
      } else {
        const r = await api.post('/supervisor/run', { text, projectKey: projectKey || undefined, providerKey: providerKey || undefined, source: 'UI' });
        setPlan(r.plan);
        if (r.execution) {
          toast({ tone: 'success', title: `Ejecución EX-${r.execution.number} creada por el supervisor` });
          router.push(`/executions/${r.execution.id}`);
        } else toast({ tone: 'warning', title: 'No se creó la ejecución', text: r.reason });
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Nueva ejecución"
        description="Elegí proyecto y orquestador, o describí el pedido y dejá que el supervisor elija el flujo."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Ejecuciones', href: '/executions' }, { label: 'Nueva' }]}
      />
      <ErrorBox error={pErr || oErr} />
      <SegmentedControl
        label="Modo de inicio"
        value={mode}
        onChange={(v) => setMode(v as 'form' | 'ask')}
        options={[
          { value: 'form', label: 'Elegir orquestador' },
          { value: 'ask', label: 'Pedido al supervisor' },
        ]}
      />
      {fromBacklog && mode === 'form' && (
        <Alert tone="info" title="Elegido desde el backlog de Jira">
          Revisá el proveedor de IA y las instrucciones opcionales, y confirmá con «Iniciar ejecución».
        </Alert>
      )}
      {project?.mode === 'DEMO' && (
        <Alert tone="info" title="Proyecto de demostración">
          {project.key} usa datos ficticios: la lectura es simulada y la publicación nunca escribe en Jira.
        </Alert>
      )}
      <Grid cols={12}>
        <Col span={8}>
          <Card title={mode === 'form' ? 'Datos de la ejecución' : 'Pedido en lenguaje natural'}>
            <div className="flex flex-col gap-4">
              <Grid cols={2} gap={15}>
                <FormField label="Proyecto" required>
                  <Select value={projectKey} onChange={setProjectKey} options={(projects ?? []).map((p) => ({ value: p.key, label: `${p.key} · ${p.name} (${p.mode})` }))} />
                </FormField>
                <FormField label="Proveedor de IA" hint="Vacío: el del proyecto o el predeterminado">
                  <Select value={providerKey} onChange={setProviderKey} placeholder="Predeterminado" options={(providers ?? []).filter((p) => p.enabled).map((p) => ({ value: p.key, label: `${p.name} (${p.status})` }))} />
                </FormField>
              </Grid>
              {mode === 'form' ? (
                <>
                  <FormField label="Orquestador" required>
                    <Select value={orchKey} onChange={(v) => { setOrchKey(v); setInput({}); }} options={active.map((o) => ({ value: o.key, label: `${o.activeVersion.definition.name} (${o.key})` }))} />
                  </FormField>
                  {def?.inputSchema.fields.map((f: any) => (
                    <FormField
                      key={f.key}
                      label={f.label}
                      required={f.required}
                      optional={!f.required}
                      hint={
                        f.type === 'issueKey' && projectKey ? (
                          <>
                            {f.description ? `${f.description} · ` : ''}
                            <TextLink href={`/backlog?project=${projectKey}${f.key === 'storyKey' ? '&tab=stories' : ''}`}>Elegir desde el backlog</TextLink>
                          </>
                        ) : (
                          f.description
                        )
                      }
                    >
                      {f.type === 'text' ? (
                        <Textarea rows={3} value={input[f.key] ?? ''} onChange={(v) => setInput((s) => ({ ...s, [f.key]: v }))} />
                      ) : (
                        <TextInput mono={f.type === 'issueKey'} value={input[f.key] ?? ''} placeholder={f.type === 'issueKey' ? `${project?.jiraProjectKey ?? 'PROJ'}-123` : ''} onChange={(v) => setInput((s) => ({ ...s, [f.key]: f.type === 'issueKey' ? v.toUpperCase() : v }))} />
                      )}
                    </FormField>
                  ))}
                  <div className="flex justify-end">
                    <Button icon="zap" loading={busy} onClick={submit} disabled={!projectKey || !orchKey}>
                      Iniciar ejecución
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <FormField label="Pedido" hint='Por ejemplo: "Analizá la épica DEMO-100 y proponé historias y tareas técnicas."'>
                    <Textarea rows={4} value={text} onChange={setText} />
                  </FormField>
                  <div className="flex justify-end gap-2">
                    <Button variant="secondary" icon="eye" loading={busy} disabled={text.trim().length < 3} onClick={() => ask(false)}>
                      Ver plan
                    </Button>
                    <Button icon="sparkles" loading={busy} disabled={text.trim().length < 3} onClick={() => ask(true)}>
                      Planificar y ejecutar
                    </Button>
                  </div>
                  {plan && (
                    <Alert tone={plan.orchestratorKey ? 'info' : 'warning'} title={plan.orchestratorKey ? `Plan: ${plan.orchestratorKey} en ${plan.projectKey ?? '¿proyecto?'}` : 'Sin orquestador aplicable'}>
                      {plan.rationale} Confianza {Math.round(plan.confidence * 100)}%. Entrada: <span className="fk-mono">{JSON.stringify(plan.input)}</span>
                      {plan.missingCapability ? ` — ${plan.missingCapability}` : ''}
                    </Alert>
                  )}
                </>
              )}
              {error ? <Alert tone="danger" title="No se pudo iniciar">{errorText(error)}</Alert> : null}
            </div>
          </Card>
        </Col>
        <Col span={4}>
          <Card title="Qué va a pasar">
            {def && mode === 'form' ? (
              <div className="flex flex-col gap-2 text-ink-muted">
                <p className="fk-text">{def.objective}</p>
                <ol className="list-decimal" style={{ paddingLeft: 20 }}>
                  {def.steps.map((s: any) => (
                    <li key={s.key}>{s.name}</li>
                  ))}
                </ol>
                <p className="fk-text fk-text--sm">Nada se publica en Jira sin tu aprobación explícita.</p>
              </div>
            ) : (
              <p className="fk-text fk-text--muted">El supervisor consulta el catálogo por metadatos, elige el orquestador y crea la ejecución con las mismas reglas que la CLI.</p>
            )}
          </Card>
        </Col>
      </Grid>
    </div>
  );
}
