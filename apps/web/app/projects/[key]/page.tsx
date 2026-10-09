'use client';

import { use, useEffect, useState } from 'react';
import { APPROVAL_MODES, OPERATION_LABELS, SPECIALTIES, fmtDateTime, type OperationType } from '@mao/shared';
import { ErrorBox, Loading, PolicyBadge, Status } from '@/components/common';
import { JsonField } from '@/components/catalog/forms';
import { Button } from '@/components/ui/core';
import { Card, DataTable, Grid, PageHeader, Tabs } from '@/components/ui/containers';
import { Alert, Tag, useToast } from '@/components/ui/feedback';
import { CheckList, FormField, LinesInput, Select, Switch, TextInput, Textarea } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';
import { MODE_LABEL } from '@/lib/labels';

export default function ProjectDetailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const toast = useToast();
  const { data: project, error, loading, reload } = useApi<any>(`/projects/${key}`);
  const { data: connections } = useApi<any[]>('/connections');
  const { data: providers } = useApi<any[]>('/providers');
  const { data: agents } = useApi<any[]>('/agents');
  const { data: skills } = useApi<any[]>('/skills');
  const { data: orchestrators } = useApi<any[]>('/orchestrators');
  const [tab, setTab] = useState('general');
  const [general, setGeneral] = useState<any>(null);
  const [cfg, setCfg] = useState<any>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (project) {
      setGeneral({ name: project.name, description: project.description, jiraProjectKey: project.jiraProjectKey, mode: project.mode, status: project.status, connectionKey: project.connection?.key ?? '', providerKey: project.defaultProvider?.key ?? '' });
      setCfg(structuredClone(project.config));
    }
  }, [project]);

  if (loading && !project) return <Loading />;
  if (error && !project) return <ErrorBox error={error} onRetry={reload} />;
  if (!project || !cfg || !general) return <Loading />;

  const run = async (fn: () => Promise<void>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ tone: 'success', title: ok });
      await reload(true);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo guardar', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  const c = (path: string[]) => (v: unknown) => {
    const next = structuredClone(cfg);
    let cur = next;
    for (const k of path.slice(0, -1)) cur = cur[k] ??= {};
    cur[path[path.length - 1]] = v;
    setCfg(next);
  };
  const r = project.resolvedConfig;
  const jira = cfg.jira ?? {};
  const discovered = jira.discovered;
  const typeOptions = discovered?.issueTypes?.length ? discovered.issueTypes.map((t: any) => ({ value: t.name, label: `${t.name}${t.subtask ? ' (subtarea)' : ''}` })) : null;
  const saveConfig = () => run(() => api.put(`/projects/${key}/config`, { config: cfg, changeNote: note || 'Edición desde la interfaz' }).then(() => setNote('')), 'Configuración guardada como nueva versión');

  // Función de render (no componente) para no remontar el input en cada tecla.
  const typeField = (role: string, label: string) => (
    <FormField label={label} hint={typeOptions ? undefined : 'Descubrí los tipos para elegir de la lista'}>
      {typeOptions ? <Select value={jira.issueTypes?.[role] ?? r.jira.issueTypes[role]} onChange={c(['jira', 'issueTypes', role])} options={typeOptions} /> : <TextInput value={jira.issueTypes?.[role] ?? r.jira.issueTypes[role]} onChange={c(['jira', 'issueTypes', role])} />}
    </FormField>
  );

  const configTabs = ['jira', 'rules', 'catalog', 'advanced'];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={project.name}
        status={<Status value={project.status} />}
        description={
          <>
            <span className="fk-mono">{project.key}</span> · Jira <span className="fk-mono">{project.jiraProjectKey}</span> · {project.mode === 'DEMO' ? 'modo demo (datos ficticios)' : 'Jira real'} · configuración v{project.configurations[0]?.version}
          </>
        }
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Proyectos', href: '/projects' }, { label: project.key }]}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" icon="kanban" href={`/backlog?project=${project.key}`}>
              Ver backlog
            </Button>
            <Button icon="zap" href={`/executions/new?project=${project.key}`}>
              Nueva ejecución
            </Button>
          </div>
        }
        tabs={
          <Tabs
            value={tab}
            onChange={setTab}
            items={[
              { value: 'general', label: 'General' },
              { value: 'jira', label: 'Jira' },
              { value: 'rules', label: 'Reglas y plantillas' },
              { value: 'catalog', label: 'Agentes y skills' },
              { value: 'approvals', label: 'Aprobaciones' },
              { value: 'advanced', label: 'Configuración (JSON)' },
              { value: 'history', label: 'Versiones', count: project.configurations.length },
            ]}
          />
        }
      />

      {tab === 'general' && (
        <Card title="Datos del proyecto" footer={<Button icon="save" loading={busy} onClick={() => run(() => api.patch(`/projects/${key}`, { ...general, connectionKey: general.connectionKey || undefined, providerKey: general.providerKey || undefined }), 'Proyecto actualizado')}>Guardar cambios</Button>}>
          <div className="flex flex-col gap-4">
            <Grid cols={2} gap={15}>
              <FormField label="Nombre" required>
                <TextInput value={general.name} onChange={(v) => setGeneral({ ...general, name: v })} />
              </FormField>
              <FormField label="Proyecto Jira" required>
                <TextInput mono value={general.jiraProjectKey} onChange={(v) => setGeneral({ ...general, jiraProjectKey: v.toUpperCase() })} />
              </FormField>
            </Grid>
            <FormField label="Descripción">
              <Textarea rows={2} value={general.description} onChange={(v) => setGeneral({ ...general, description: v })} />
            </FormField>
            <Grid cols={4} gap={15}>
              <FormField label="Modo">
                <Select value={general.mode} onChange={(v) => setGeneral({ ...general, mode: v })} options={[{ value: 'DEMO', label: 'Demo' }, { value: 'JIRA', label: 'Jira real' }]} />
              </FormField>
              <FormField label="Conexión">
                <Select value={general.connectionKey} onChange={(v) => setGeneral({ ...general, connectionKey: v })} placeholder="Ninguna" options={(connections ?? []).map((x) => ({ value: x.key, label: `${x.name} (${x.status})` }))} />
              </FormField>
              <FormField label="Proveedor de IA">
                <Select value={general.providerKey} onChange={(v) => setGeneral({ ...general, providerKey: v })} placeholder="Predeterminado" options={(providers ?? []).map((x) => ({ value: x.key, label: x.name }))} />
              </FormField>
              <FormField label="Estado">
                <Select value={general.status} onChange={(v) => setGeneral({ ...general, status: v })} options={[{ value: 'ACTIVE', label: 'Activo' }, { value: 'INACTIVE', label: 'Inactivo' }, { value: 'ARCHIVED', label: 'Archivado' }]} />
              </FormField>
            </Grid>
            {general.mode === 'JIRA' && (
              <Alert tone="info" title="Modo Jira real">
                La lectura usa el servidor MCP en modo solo lectura. Las escrituras requieren aprobación, la política vigente, la escritura habilitada en la conexión y <span className="fk-mono">MAO_ALLOW_JIRA_WRITES=true</span>.
              </Alert>
            )}
          </div>
        </Card>
      )}

      {tab === 'jira' && (
        <Card
          title="Esquema Jira del proyecto"
          subtitle="No se asume que todos los proyectos tengan el mismo esquema: los tipos y campos se descubren con el conector."
          actions={<Button size="sm" variant="secondary" icon="search" loading={busy} onClick={() => run(() => api.post(`/projects/${key}/discover`, { apply: true }), 'Descubrimiento guardado como nueva versión')}>Descubrir tipos y campos</Button>}
          footer={<SaveBar note={note} setNote={setNote} busy={busy} onSave={saveConfig} />}
        >
          <div className="flex flex-col gap-4">
            {discovered ? (
              <Alert tone="success" title={`Descubierto el ${fmtDateTime(discovered.at)}`}>
                Tipos: {discovered.issueTypes.map((t: any) => t.name).join(', ')} · {discovered.fields.length} campos.
              </Alert>
            ) : (
              <Alert tone="warning" title="Sin descubrimiento">Ejecutá el descubrimiento para mapear tipos y campos reales.</Alert>
            )}
            <FormField
              label="Transición para cancelar historias"
              hint={
                discovered?.transitions?.length
                  ? `Transiciones de ${discovered.transitionsFrom ?? 'una historia del proyecto'}. Se usa cuando un agente propone cancelar una HU duplicada, fuera de alcance u obsoleta (siempre con aprobación individual).`
                  : 'Descubrí tipos y campos para ver las transiciones reales del flujo de trabajo. Si no hay un estado de cancelación, se puede agregar en Jira.'
              }
            >
              <Select
                value={jira.cancelTransition?.id ?? ''}
                placeholder="Sin mapear (las cancelaciones no se ejecutan)"
                disabled={!discovered?.transitions?.length}
                onChange={(id) => {
                  const t = (discovered?.transitions ?? []).find((x: any) => x.id === id);
                  c(['jira', 'cancelTransition'])(t ? { id: t.id, name: t.name } : undefined);
                }}
                options={(discovered?.transitions ?? []).map((t: any) => ({ value: t.id, label: `${t.name} (id ${t.id})` }))}
              />
            </FormField>
            <Grid cols={4} gap={15}>
              {typeField('epic', 'Tipo épica')}
              {typeField('story', 'Tipo historia')}
              {typeField('task', 'Tipo tarea')}
              {typeField('subtask', 'Tipo subtarea')}
            </Grid>
            <Grid cols={3} gap={15}>
              <FormField label="Jerarquía de tareas">
                <Select value={jira.taskHierarchy ?? r.jira.taskHierarchy} onChange={c(['jira', 'taskHierarchy'])} options={[{ value: 'subtask', label: 'Subtareas de la historia' }, { value: 'parent', label: 'Tareas con padre = historia' }, { value: 'link', label: 'Tareas vinculadas' }]} />
              </FormField>
              <FormField label="Tipo de vínculo de bloqueo">
                <TextInput value={jira.linkTypes?.blocks ?? r.jira.linkTypes.blocks} onChange={c(['jira', 'linkTypes', 'blocks'])} />
              </FormField>
              <FormField label="Tipo de vínculo de relación">
                <TextInput value={jira.linkTypes?.relates ?? r.jira.linkTypes.relates} onChange={c(['jira', 'linkTypes', 'relates'])} />
              </FormField>
            </Grid>
            <Switch label="Agregar etiqueta de correlación (mao-xxxx) a las issues creadas, para reconciliar operaciones inciertas" checked={jira.correlationLabel ?? r.jira.correlationLabel} onChange={c(['jira', 'correlationLabel'])} />
            <FormField label="Campo de story points" hint="Solo campos descubiertos">
              <Select value={cfg.storyPoints?.fieldId ?? ''} onChange={(v) => c(['storyPoints', 'fieldId'])(v || undefined)} placeholder="Sin mapear" options={(discovered?.fields ?? []).filter((f: any) => f.custom).map((f: any) => ({ value: f.id, label: `${f.name} (${f.id})` }))} />
            </FormField>
            <FormField label="Campos obligatorios" hint="Una clave por línea">
              <LinesInput rows={2} value={jira.requiredFields ?? []} onChange={c(['jira', 'requiredFields'])} />
            </FormField>
          </div>
        </Card>
      )}

      {tab === 'rules' && (
        <Card title="Reglas, plantillas y definiciones" footer={<SaveBar note={note} setNote={setNote} busy={busy} onSave={saveConfig} />}>
          <div className="flex flex-col gap-4">
            <FormField label="Tecnologías" hint="Separadas por coma. El supervisor detecta las que ningún agente o skill cubre.">
              <TextInput value={(cfg.technologies ?? r.technologies).join(', ')} onChange={(v) => c(['technologies'])(v.split(',').map((x) => x.trim()).filter(Boolean))} />
            </FormField>
            <FormField label="Especialidades">
              <CheckList columns={4} options={SPECIALTIES.map((s) => ({ value: s, label: s }))} value={cfg.specialties ?? r.specialties} onChange={c(['specialties'])} />
            </FormField>
            <Grid cols={2} gap={15}>
              <FormField label="Definition of Ready" hint="Un criterio por línea">
                <LinesInput rows={5} value={cfg.definitionOfReady ?? r.definitionOfReady} onChange={c(['definitionOfReady'])} />
              </FormField>
              <FormField label="Definition of Done" hint="Un criterio por línea">
                <LinesInput rows={5} value={cfg.definitionOfDone ?? r.definitionOfDone} onChange={c(['definitionOfDone'])} />
              </FormField>
            </Grid>
            <FormField label="Reglas del proyecto" hint="Una por línea">
              <LinesInput rows={3} value={cfg.rules ?? r.rules} onChange={c(['rules'])} />
            </FormField>
            <FormField label="Plantilla de descripción de historia" hint="Variables: {{objective}}, {{expectedBehavior}}, {{acceptanceCriteria}}, {{businessRules}}, {{assumptions}}">
              <Textarea rows={8} mono value={cfg.templates?.storyDescription ?? r.templates.storyDescription} onChange={c(['templates', 'storyDescription'])} />
            </FormField>
            <Grid cols={3} gap={15}>
              <FormField label="Formato de criterios">
                <Select value={cfg.templates?.acceptanceCriteriaFormat ?? r.templates.acceptanceCriteriaFormat} onChange={c(['templates', 'acceptanceCriteriaFormat'])} options={[{ value: 'gherkin', label: 'Dado / Cuando / Entonces' }, { value: 'checklist', label: 'Checklist' }]} />
              </FormField>
              <FormField label="Mínimo de criterios por historia">
                <TextInput type="number" value={cfg.templates?.minAcceptanceCriteria ?? r.templates.minAcceptanceCriteria} onChange={(v) => c(['templates', 'minAcceptanceCriteria'])(Number(v))} />
              </FormField>
              <FormField label="Story points">
                <Switch label="Estimar con story points" checked={cfg.storyPoints?.enabled ?? r.storyPoints.enabled} onChange={c(['storyPoints', 'enabled'])} />
              </FormField>
            </Grid>
            <Grid cols={4} gap={15}>
              {SPECIALTIES.map((s) => (
                <FormField key={s} label={`Prefijo ${s}`}>
                  <TextInput value={cfg.templates?.taskTitlePrefix?.[s] ?? r.templates.taskTitlePrefix[s]} onChange={c(['templates', 'taskTitlePrefix', s])} />
                </FormField>
              ))}
            </Grid>
          </div>
        </Card>
      )}

      {tab === 'catalog' && (
        <Card title="Catálogo habilitado" subtitle="Vacío = todos los activos." footer={<SaveBar note={note} setNote={setNote} busy={busy} onSave={saveConfig} />}>
          <div className="flex flex-col gap-4">
            <FormField label="Orquestadores habilitados">
              <CheckList columns={2} options={(orchestrators ?? []).map((o) => ({ value: o.key, label: o.key }))} value={cfg.enabledOrchestrators ?? []} onChange={c(['enabledOrchestrators'])} />
            </FormField>
            <FormField label="Agentes habilitados">
              <CheckList columns={3} options={(agents ?? []).map((a) => ({ value: a.key, label: a.key }))} value={cfg.enabledAgents ?? []} onChange={c(['enabledAgents'])} />
            </FormField>
            <FormField label="Skills particulares del proyecto" hint="Se agregan a todos los agentes en las tareas donde aplican">
              <CheckList columns={3} options={(skills ?? []).map((s) => ({ value: s.key, label: s.key }))} value={cfg.projectSkills ?? []} onChange={c(['projectSkills'])} />
            </FormField>
          </div>
        </Card>
      )}

      {tab === 'approvals' && <ProjectPolicies projectKey={key} effective={project.effectivePolicies} onChanged={() => reload(true)} />}

      {tab === 'advanced' && (
        <Card title="Configuración del proyecto (JSON)" subtitle="Se valida con el mismo esquema que el formulario." footer={<SaveBar note={note} setNote={setNote} busy={busy} onSave={saveConfig} />}>
          <JsonField value={cfg} onChange={setCfg} rows={30} />
        </Card>
      )}

      {tab === 'history' && (
        <Card title="Versiones de la configuración" padding="none">
          <DataTable
            rows={project.configurations}
            columns={[
              { key: 'version', header: 'Versión', render: (x: any) => `v${x.version}` },
              { key: 'status', header: 'Estado', render: (x: any) => <Status value={x.status} size="sm" /> },
              { key: 'changeNote', header: 'Nota', wrap: true },
              { key: 'createdBy', header: 'Autor' },
              { key: 'createdAt', header: 'Fecha', render: (x: any) => fmtDateTime(x.createdAt) },
              { key: 'checksum', header: 'Checksum', render: (x: any) => <span className="fk-mono">{x.checksum.slice(0, 10)}</span> },
            ]}
          />
        </Card>
      )}
      {configTabs.includes(tab) && <p className="fk-text fk-text--sm fk-text--subtle">Guardar crea una nueva versión; las ejecuciones existentes conservan la versión con la que se crearon.</p>}
    </div>
  );
}

function SaveBar({ note, setNote, busy, onSave }: { note: string; setNote: (v: string) => void; busy: boolean; onSave: () => void }) {
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <div className="min-w-[240px] flex-1">
        <TextInput value={note} onChange={setNote} placeholder="Nota del cambio (opcional)" />
      </div>
      <Button icon="save" loading={busy} onClick={onSave}>
        Guardar nueva versión
      </Button>
    </div>
  );
}

function ProjectPolicies({ projectKey, effective, onChanged }: { projectKey: string; effective: any[]; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const setMode = async (op: string, mode: string) => {
    setBusy(op);
    try {
      await api.post('/policies', { scope: 'PROJECT', projectKey, operationType: op, mode, description: 'Configurada desde la interfaz' });
      toast({ tone: 'success', title: `Política ${op} actualizada para ${projectKey}` });
      onChanged();
    } catch (e) {
      toast({ tone: 'danger', title: 'Política rechazada', text: errorText(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card title="Políticas efectivas" subtitle="Global → proyecto → operación. Un proyecto nunca puede relajar una prohibición obligatoria ni el piso de seguridad." padding="none">
      <DataTable
        rows={effective.map((e) => ({ ...e, id: e.operationType }))}
        columns={[
          { key: 'op', header: 'Operación', render: (r: any) => OPERATION_LABELS[r.operationType as OperationType] ?? r.operationType },
          { key: 'mode', header: 'Modo efectivo', render: (r: any) => <PolicyBadge mode={r.mode} /> },
          { key: 'source', header: 'Origen', render: (r: any) => <Tag size="sm">{r.source}</Tag> },
          { key: 'reasons', header: 'Motivo', wrap: true, render: (r: any) => <span className="fk-text fk-text--sm">{r.reasons.join(' · ')}</span> },
          {
            key: 'set',
            header: 'Definir para el proyecto',
            render: (r: any) => (
              <div style={{ width: 220 }}>
                <Select size="sm" value="" disabled={busy === r.operationType} onChange={(v) => v && setMode(r.operationType, v)} placeholder="Cambiar…" options={APPROVAL_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
