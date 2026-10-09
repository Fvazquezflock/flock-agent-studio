'use client';

import { useEffect, useState } from 'react';
import { APPROVAL_MODES, OPERATION_LABELS, fmtDateTime, type OperationType } from '@mao/shared';
import { ErrorBox, Loading, PolicyBadge, Status } from '@/components/common';
import { JsonField } from '@/components/catalog/forms';
import { Button } from '@/components/ui/core';
import { Accordion, Card, ConfirmDialog, DataTable, DescriptionList, Grid, PageHeader, Tabs } from '@/components/ui/containers';
import { Alert, StatusBadge, Tag, useToast } from '@/components/ui/feedback';
import { FormField, Select, Switch, TextInput } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';
import { MODE_LABEL } from '@/lib/labels';

function useRunner() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (id: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(id);
    try {
      const r = await fn();
      if (ok) toast({ tone: 'success', title: ok });
      return r;
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar', text: errorText(e) });
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function ServicesTab() {
  const { data, error, reload } = useApi<any>('/status', { refreshMs: 10000 });
  if (!data) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <Grid cols={3}>
        <Card title="API">
          <Status value={data.api} />
          <p className="fk-text fk-text--sm fk-text--subtle mt-2">Escucha solo en 127.0.0.1; toda ruta /api exige el token del propietario.</p>
        </Card>
        <Card title="Base de datos">
          <Status value={data.db} />
          <p className="fk-text fk-text--sm fk-text--subtle mt-2">
            {data.dbTarget?.remote
              ? `PostgreSQL remoto${data.dbTarget.tls ? ' con TLS' : ' sin TLS'}.`
              : 'PostgreSQL local (embebido o Docker), solo loopback.'}
          </p>
          {data.dbTarget && (
            <p className="fk-text fk-text--sm fk-mono mt-1">
              {data.dbTarget.host}:{data.dbTarget.port}/{data.dbTarget.database}
            </p>
          )}
          {data.dbTarget?.remote && !data.dbTarget.tls && (
            <p className="fk-text fk-text--sm mt-1">Agregá sslmode=require a DATABASE_URL para cifrar la conexión.</p>
          )}
        </Card>
        <Card title="Worker">
          <Status value={data.worker} />
          {data.workers.map((w: any) => (
            <p key={w.workerId} className="fk-text fk-text--sm fk-text--subtle mt-2">
              {w.workerId} · {w.running} en curso · visto {fmtDateTime(w.seenAt)} {w.alive ? '' : '(inactivo)'}
            </p>
          ))}
        </Card>
      </Grid>
      <Alert tone={data.jiraWritesAllowed ? 'warning' : 'info'} title={data.jiraWritesAllowed ? 'Escrituras reales en Jira permitidas por entorno' : 'Escrituras reales en Jira bloqueadas por entorno'}>
        <span className="fk-mono">MAO_ALLOW_JIRA_WRITES={String(data.jiraWritesAllowed)}</span>. Aun habilitadas, cada escritura exige aprobación, política vigente y escritura habilitada en la conexión.
      </Alert>
    </div>
  );
}

function ConnectionsTab() {
  const { data, error, reload } = useApi<any[]>('/connections');
  const { busy, run } = useRunner();
  const [read, setRead] = useState<Record<string, any>>({});
  const [params, setParams] = useState({ projectKey: '', issueKey: '' });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [nc, setNc] = useState({ key: '', name: '', envFile: '' });
  if (!data) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;
  const envFile = nc.envFile || `MCP/mcp-atlassian/${nc.key || 'otro-jira'}.env`;
  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Nueva conexión Jira"
        subtitle="Otro sitio de Jira u otra cuenta (dominio, mail y token propios) con el mismo servidor MCP. Cada proyecto elige su conexión en la ficha del proyecto."
      >
        <div className="flex flex-col gap-3">
          <Grid cols={3} gap={15}>
            <FormField label="Clave" hint="Minúsculas, números y guiones" required>
              <TextInput mono value={nc.key} placeholder="jira-cliente-x" onChange={(v) => setNc({ ...nc, key: v.toLowerCase() })} />
            </FormField>
            <FormField label="Nombre" required>
              <TextInput value={nc.name} placeholder="Jira de Cliente X" onChange={(v) => setNc({ ...nc, name: v })} />
            </FormField>
            <FormField label="Archivo de credenciales" hint="Dentro de MCP/ (ignorado por git), terminado en .env">
              <TextInput mono value={envFile} onChange={(v) => setNc({ ...nc, envFile: v })} />
            </FormField>
          </Grid>
          <p className="fk-text fk-text--sm fk-text--muted">
            La plataforma solo guarda la ruta del archivo, nunca las credenciales. Para crearlo desde la plantilla:{' '}
            <span className="fk-mono">powershell -ExecutionPolicy Bypass -File scripts\setup-mcp.ps1 -EnvFile {envFile.replace(/\//g, '\\')}</span> y completá JIRA_URL, JIRA_USERNAME y JIRA_API_TOKEN. Después usá «Diagnosticar». La escritura arranca deshabilitada.
          </p>
          <div className="flex justify-end">
            <Button
              size="sm"
              icon="plus"
              loading={busy === 'new-connection'}
              disabled={!/^[a-z][a-z0-9-]{1,39}$/.test(nc.key) || nc.name.trim().length < 2}
              onClick={() =>
                run('new-connection', async () => {
                  await api.post('/connections', { key: nc.key, name: nc.name.trim(), envFile });
                  setNc({ key: '', name: '', envFile: '' });
                  await reload();
                }, 'Conexión creada')
              }
            >
              Crear conexión
            </Button>
          </div>
        </div>
      </Card>
      {data.map((c) => {
        const caps = c.capabilities as any;
        return (
          <Card
            key={c.key}
            title={c.name}
            subtitle={`${c.key} · ${c.kind} · ${c.purpose}`}
            actions={
              <div className="flex flex-wrap gap-2">
                <Status value={c.status} />
                <Button size="sm" variant="secondary" icon="refresh" loading={busy === `d-${c.key}`} onClick={() => run(`d-${c.key}`, () => api.post(`/connections/${c.key}/diagnose`).then(() => reload(true)), 'Diagnóstico actualizado')}>
                  Diagnosticar
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-4">
              <DescriptionList
                columns={3}
                items={[
                  { label: 'Transporte', value: caps?.transport ?? 'stdio' },
                  { label: 'Servidor', value: caps?.server ? `${caps.server.name} ${caps.server.version}` : '—' },
                  { label: 'Herramientas', value: caps?.toolCount ?? '—' },
                  { label: 'Comando', value: <span className="fk-mono" style={{ fontSize: 12 }}>{(c.config as any).command}</span>, span: 2 },
                  { label: 'Último diagnóstico', value: fmtDateTime(c.lastCheckedAt) },
                  { label: 'Archivo de credenciales', value: <span className="fk-mono" style={{ fontSize: 12 }}>{((c.config as any).args ?? [])[((c.config as any).args ?? []).indexOf('--env-file') + 1] ?? '—'}</span>, span: 2 },
                  { label: 'Proyectos', value: c.projects.map((p: any) => p.key).join(', ') || '—' },
                ]}
              />
              {c.lastError && <Alert tone="danger" title="Último error">{c.lastError}</Alert>}
              <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3">
                <Switch
                  label={c.writeEnabled ? 'Escritura habilitada en esta conexión' : 'Escritura deshabilitada (recomendado hasta probar en un entorno de prueba)'}
                  checked={c.writeEnabled}
                  onChange={(v) => (v ? setConfirm(c.key) : run(`w-${c.key}`, () => api.post(`/connections/${c.key}/write`, { enabled: false }).then(() => reload(true)), 'Escritura deshabilitada'))}
                />
              </div>
              {caps?.capabilities && (
                <DataTable
                  compact
                  rows={caps.capabilities.map((x: any) => ({ ...x, id: x.operation }))}
                  toolbar={<div className="fk-ttool"><span className="fk-h4">Mapa real de capacidades</span></div>}
                  columns={[
                    { key: 'operation', header: 'Operación de dominio', render: (r: any) => <span className="fk-mono">{r.operation}</span> },
                    { key: 'kind', header: 'Tipo', render: (r: any) => (r.kind === 'write' ? <Tag size="sm" variant="brand">Escritura</Tag> : <Tag size="sm">Lectura</Tag>) },
                    { key: 'supported', header: 'Soporte', render: (r: any) => <StatusBadge size="sm" tone={r.supported ? 'success' : 'danger'}>{r.supported ? 'Soportada' : 'No soportada'}</StatusBadge> },
                    { key: 'tool', header: 'Herramienta MCP', render: (r: any) => <span className="fk-mono">{r.tool ?? '—'}</span> },
                    { key: 'note', header: 'Nota', wrap: true },
                  ]}
                />
              )}
              {caps?.tools && (
                <Accordion
                  items={[
                    {
                      title: `Herramientas expuestas por el servidor (${caps.tools.length})`,
                      meta: `${caps.tools.filter((t: any) => t.forbidden).length} nunca invocadas por la plataforma`,
                      content: (
                        <div className="flex flex-wrap gap-2">
                          {caps.tools.map((t: any) => (
                            <Tag key={t.name} size="sm" variant={t.forbidden ? 'brand' : undefined}>
                              {t.name}
                              {t.readOnly ? ' · lectura' : t.destructive ? ' · destructiva' : ''}
                              {t.forbidden ? ' · prohibida' : ''}
                            </Tag>
                          ))}
                        </div>
                      ),
                    },
                  ]}
                />
              )}
              <div className="flex flex-wrap items-end gap-3">
                <FormField label="Proyecto Jira">
                  <TextInput mono value={params.projectKey} onChange={(v) => setParams({ ...params, projectKey: v.toUpperCase() })} placeholder="SCRUM" />
                </FormField>
                <FormField label="Issue">
                  <TextInput mono value={params.issueKey} onChange={(v) => setParams({ ...params, issueKey: v.toUpperCase() })} placeholder="SCRUM-1" />
                </FormField>
                <Button variant="secondary" icon="search" loading={busy === `r-${c.key}`} onClick={async () => { const r = await run(`r-${c.key}`, () => api.post(`/connections/${c.key}/test-read`, { projectKey: params.projectKey || undefined, issueKey: params.issueKey || undefined })); if (r) setRead((s) => ({ ...s, [c.key]: r })); }}>
                  Lectura de prueba (solo lectura)
                </Button>
              </div>
              {read[c.key] && (
                <Alert tone={read[c.key].ok ? 'success' : 'danger'} title={read[c.key].ok ? 'Lectura real exitosa' : `Error ${read[c.key].error?.code}`}>
                  {read[c.key].ok ? (
                    <>
                      {read[c.key].project && `Proyecto ${read[c.key].project.key} "${read[c.key].project.name}" · tipos: ${read[c.key].issueTypes.map((t: any) => t.name).join(', ')}. `}
                      {read[c.key].issue && `Issue ${read[c.key].issue.key} "${read[c.key].issue.summary}" (${read[c.key].issue.issueType}, ${read[c.key].issue.status}). `}
                      {read[c.key].linkTypes && `Tipos de vínculo: ${read[c.key].linkTypes.map((l: any) => l.name).join(', ')}.`}
                    </>
                  ) : (
                    read[c.key].error?.message
                  )}
                </Alert>
              )}
            </div>
          </Card>
        );
      })}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        tone="danger"
        title="Habilitar escritura en Jira"
        confirmLabel="Habilitar escritura"
        confirmText="HABILITAR ESCRITURA"
        loading={!!busy}
        message="Permite que el servicio de publicación cree y actualice issues reales con lo que apruebes. Hacelo solo en un entorno autorizado. También hace falta MAO_ALLOW_JIRA_WRITES=true."
        onConfirm={() => run(`w-${confirm}`, () => api.post(`/connections/${confirm}/write`, { enabled: true, confirm: 'HABILITAR ESCRITURA' }).then(() => { setConfirm(null); return reload(true); }), 'Escritura habilitada en la conexión')}
      />
    </div>
  );
}

function ProvidersTab() {
  const { data, error, reload } = useApi<any[]>('/providers');
  const { busy, run } = useRunner();
  const [deep, setDeep] = useState<string | null>(null);
  if (!data) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="Autenticación separada por proveedor">
        Claude Code local usa la sesión de su CLI (<span className="fk-mono">claude auth login</span>); la API de Anthropic usa su propia API key en una variable de entorno. La plataforma no copia ni reutiliza credenciales entre modalidades.
      </Alert>
      {data.map((p) => {
        const d = p.lastDiagnosis as any;
        return (
          <Card
            key={p.key}
            title={p.name}
            subtitle={`${p.key} · ${p.kind}${p.isDefault ? ' · predeterminado' : ''}`}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Status value={p.status} />
                <Button size="sm" variant="secondary" icon="refresh" loading={busy === `d-${p.key}`} onClick={() => run(`d-${p.key}`, () => api.post(`/providers/${p.key}/diagnose`, { deep: false }).then(() => reload(true)), 'Diagnóstico actualizado')}>
                  Diagnosticar
                </Button>
                {p.kind !== 'MOCK' && (
                  <Button size="sm" variant="secondary" icon="zap" onClick={() => setDeep(p.key)}>
                    Invocación de prueba
                  </Button>
                )}
                {!p.isDefault && (
                  <Button size="sm" variant="ghost" loading={busy === `def-${p.key}`} onClick={() => run(`def-${p.key}`, () => api.patch(`/providers/${p.key}`, { isDefault: true }).then(() => reload(true)), `${p.name} es el predeterminado`)}>
                    Usar como predeterminado
                  </Button>
                )}
              </div>
            }
          >
            <div className="flex flex-col gap-3">
              <Switch label={p.enabled ? 'Habilitado' : 'Deshabilitado'} checked={p.enabled} onChange={(v) => run(`e-${p.key}`, () => api.patch(`/providers/${p.key}`, { enabled: v }).then(() => reload(true)))} />
              <DescriptionList columns={3} items={Object.entries(p.config as object).map(([k, v]) => ({ label: k, value: <span className="fk-mono">{String(v)}</span> }))} />
              {d && (
                <Alert tone={d.status === 'AVAILABLE' ? 'success' : d.status === 'ERROR' ? 'danger' : 'warning'} title={d.detail}>
                  {d.checks.map((c: any) => `${c.ok ? '✓' : '✗'} ${c.name}: ${c.detail}`).join(' · ')}
                </Alert>
              )}
              {p.kind === 'MOCK' && <p className="fk-text fk-text--sm fk-text--subtle">Simulación determinística: los resultados se marcan siempre como simulados.</p>}
            </div>
          </Card>
        );
      })}
      <ConfirmDialog
        open={!!deep}
        onClose={() => setDeep(null)}
        tone="warning"
        title="Invocación de prueba"
        confirmLabel="Invocar"
        loading={!!busy}
        message="Hace una llamada real y mínima al modelo (puede consumir cuota o costo)."
        onConfirm={() => run(`deep-${deep}`, () => api.post(`/providers/${deep}/diagnose`, { deep: true }).then(() => { setDeep(null); return reload(true); }), 'Invocación de prueba terminada')}
      />
    </div>
  );
}

function GlobalTab() {
  const { data, error, reload } = useApi<any>('/settings/global');
  const { busy, run } = useRunner();
  const [cfg, setCfg] = useState<any>(null);
  useEffect(() => {
    if (data) setCfg(data.config);
  }, [data]);
  if (!data || !cfg) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;
  return (
    <Card title={`Configuración global v${data.version}`} subtitle="Base de la herencia global → proyecto → operación. Las reglas de seguridad obligatorias no son editables." footer={<Button icon="save" loading={busy === 'g'} onClick={() => run('g', () => api.put('/settings/global', { config: cfg }).then(() => reload(true)), 'Configuración global guardada')}>Guardar</Button>}>
      <div className="flex flex-col gap-4">
        <Grid cols={4} gap={15}>
          <FormField label="Ejecuciones concurrentes">
            <TextInput type="number" value={cfg.limits.maxConcurrentExecutions} onChange={(v) => setCfg({ ...cfg, limits: { ...cfg.limits, maxConcurrentExecutions: Number(v) } })} />
          </FormField>
          <FormField label="Intentos máx. por etapa">
            <TextInput type="number" value={cfg.limits.maxStepAttempts} onChange={(v) => setCfg({ ...cfg, limits: { ...cfg.limits, maxStepAttempts: Number(v) } })} />
          </FormField>
          <FormField label="Timeout por etapa (ms)">
            <TextInput type="number" value={cfg.limits.defaultStepTimeoutMs} onChange={(v) => setCfg({ ...cfg, limits: { ...cfg.limits, defaultStepTimeoutMs: Number(v) } })} />
          </FormField>
          <FormField label="Presupuesto USD por ejecución">
            <TextInput type="number" value={cfg.limits.maxBudgetUsdPerExecution} onChange={(v) => setCfg({ ...cfg, limits: { ...cfg.limits, maxBudgetUsdPerExecution: Number(v) } })} />
          </FormField>
        </Grid>
        <Alert tone="info" title="Reglas obligatorias (fijas)">
          Eliminar información externa: prohibido · Herramientas de escritura para agentes: prohibidas · Activaciones: siempre con aprobación.
        </Alert>
        <FormField label="Valores por defecto para proyectos (JSON)">
          <JsonField value={cfg.defaults} onChange={(d) => setCfg({ ...cfg, defaults: d })} rows={10} />
        </FormField>
      </div>
    </Card>
  );
}

function PoliciesTab() {
  const { data, error, reload } = useApi<any[]>('/policies/effective');
  const { busy, run } = useRunner();
  const { data: history } = useApi<any[]>('/policies?history=1');
  const [mandatory, setMandatory] = useState(false);
  if (!data) return error ? <ErrorBox error={error} onRetry={reload} /> : <Loading />;
  return (
    <div className="flex flex-col gap-4">
      <Card title="Políticas globales" subtitle="Toda autorización la aplica el backend antes de cada operación; nunca depende de instrucciones del modelo." padding="none">
        <DataTable
          rows={data.map((e) => ({ ...e, id: e.operationType }))}
          toolbar={
            <div className="fk-ttool">
              <span className="fk-ttool__title">
                <span className="fk-h4">Matriz efectiva</span>
              </span>
              <Switch label="Al cambiar, marcar como obligatoria" checked={mandatory} onChange={setMandatory} />
            </div>
          }
          columns={[
            { key: 'op', header: 'Operación', render: (r: any) => OPERATION_LABELS[r.operationType as OperationType] ?? r.operationType },
            { key: 'mode', header: 'Modo', render: (r: any) => <PolicyBadge mode={r.mode} /> },
            { key: 'reasons', header: 'Motivo', wrap: true, render: (r: any) => <span className="fk-text fk-text--sm">{r.reasons.join(' · ')}</span> },
            {
              key: 'set',
              header: 'Cambiar',
              render: (r: any) => (
                <div style={{ width: 210 }}>
                  <Select size="sm" value="" disabled={busy === r.operationType} placeholder="Cambiar…" onChange={(v) => v && run(r.operationType, () => api.post('/policies', { scope: 'GLOBAL', operationType: r.operationType, mode: v, mandatory, description: 'Configurada desde la interfaz' }).then(() => reload(true)), 'Política actualizada')} options={APPROVAL_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
                </div>
              ),
            },
          ]}
        />
      </Card>
      {history && (
        <Card title="Historial de políticas" padding="none">
          <DataTable
            compact
            rows={history}
            columns={[
              { key: 'operationType', header: 'Operación' },
              { key: 'scope', header: 'Ámbito', render: (r: any) => `${r.scope}${r.project ? ` ${r.project.key}` : ''}${r.orchestratorKey ? ` / ${r.orchestratorKey}` : ''}` },
              { key: 'mode', header: 'Modo', render: (r: any) => <PolicyBadge mode={r.mode} /> },
              { key: 'mandatory', header: 'Obligatoria', render: (r: any) => (r.mandatory ? 'Sí' : 'No') },
              { key: 'version', header: 'Versión', render: (r: any) => `v${r.version}` },
              { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
              { key: 'createdAt', header: 'Fecha', render: (r: any) => fmtDateTime(r.createdAt) },
            ]}
          />
        </Card>
      )}
    </div>
  );
}

function ExportTab() {
  const { busy, run } = useRunner();
  const [res, setRes] = useState<any>(null);
  return (
    <Card title="Exportar a Claude Code" subtitle="Genera .claude/agents/*.md y .claude/skills/*/SKILL.md solo desde versiones ACTIVAS (aprobadas). La fuente de verdad sigue siendo la plataforma.">
      <div className="flex flex-col gap-3">
        <div>
          <Button icon="download" loading={busy === 'x'} onClick={async () => setRes(await run('x', () => api.post('/export/claude-code'), 'Exportación generada'))}>
            Generar archivos
          </Button>
        </div>
        {res && (
          <Alert tone="success" title={`${res.files.length} archivo(s) en ${res.directory}`}>
            <span className="fk-mono" style={{ fontSize: 12 }}>
              {res.files.join(' · ')}
            </span>
          </Alert>
        )}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const [tab, setTab] = useState('services');
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Ajustes generales"
        description="Conexiones MCP, proveedores de IA, parámetros globales, seguridad y estado de los servicios."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Ajustes generales' }]}
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'services', label: 'Estado de servicios' },
              { value: 'connections', label: 'Conexiones MCP' },
              { value: 'providers', label: 'Proveedores de IA' },
              { value: 'global', label: 'Parámetros globales' },
              { value: 'policies', label: 'Seguridad y políticas' },
              { value: 'export', label: 'Exportar' },
            ]}
          />
        }
      />
      {tab === 'services' && <ServicesTab />}
      {tab === 'connections' && <ConnectionsTab />}
      {tab === 'providers' && <ProvidersTab />}
      {tab === 'global' && <GlobalTab />}
      {tab === 'policies' && <PoliciesTab />}
      {tab === 'export' && <ExportTab />}
    </div>
  );
}
