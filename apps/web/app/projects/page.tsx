'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBox, Status } from '@/components/common';
import { Button } from '@/components/ui/core';
import { DataTable, Grid, Modal, PageHeader } from '@/components/ui/containers';
import { EmptyState, Tag, useToast } from '@/components/ui/feedback';
import { FormField, Select, TextInput, Textarea } from '@/components/ui/forms';
import { api, errorText, useApi } from '@/lib/api';

export default function ProjectsPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<any[]>('/projects');
  const { data: connections } = useApi<any[]>('/connections');
  const { data: providers } = useApi<any[]>('/providers');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ key: '', name: '', description: '', jiraProjectKey: '', mode: 'DEMO', connectionKey: '', providerKey: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const create = async () => {
    setBusy(true);
    try {
      await api.post('/projects', { ...form, connectionKey: form.connectionKey || undefined, providerKey: form.providerKey || undefined });
      toast({ tone: 'success', title: `Proyecto ${form.key} creado` });
      router.push(`/projects/${form.key}`);
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo crear el proyecto', text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Proyectos"
        description="Cada proyecto define su conexión Jira, plantillas, reglas, agentes habilitados y políticas de aprobación. La configuración hereda de la global."
        breadcrumbs={[{ label: 'Inicio', href: '/' }, { label: 'Configuración' }, { label: 'Proyectos' }]}
        actions={
          <Button icon="plus" onClick={() => setOpen(true)}>
            Nuevo proyecto
          </Button>
        }
      />
      <ErrorBox error={error} onRetry={reload} />
      <DataTable
        loading={loading && !data}
        rows={data ?? []}
        rowKey="key"
        onRowClick={(r) => router.push(`/projects/${r.key}`)}
        empty={<EmptyState compact icon="folder" title="Todavía no hay proyectos" />}
        columns={[
          { key: 'key', header: 'Clave', render: (r: any) => <span className="fk-mono">{r.key}</span> },
          { key: 'name', header: 'Nombre' },
          { key: 'jira', header: 'Proyecto Jira', render: (r: any) => <span className="fk-mono">{r.jiraProjectKey}</span> },
          { key: 'mode', header: 'Modo', render: (r: any) => (r.mode === 'DEMO' ? <Tag size="sm">Demo</Tag> : <Tag size="sm" variant="brand">Jira real</Tag>) },
          { key: 'conn', header: 'Conexión', render: (r: any) => (r.connection ? `${r.connection.key} (${r.connection.status})` : '—') },
          { key: 'prov', header: 'Proveedor', render: (r: any) => r.defaultProvider?.name ?? 'Predeterminado' },
          { key: 'ex', header: 'Ejecuciones', align: 'right', render: (r: any) => r._count.executions },
          { key: 'status', header: 'Estado', render: (r: any) => <Status value={r.status} size="sm" /> },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo proyecto"
        description="Arranca con la configuración global. Los tipos y campos de Jira se descubren con el conector, nunca se inventan."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button icon="plus" loading={busy} disabled={!form.key || !form.name || !form.jiraProjectKey || (form.mode === 'JIRA' && !form.connectionKey)} onClick={create}>
              Crear proyecto
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Grid cols={2} gap={15}>
            <FormField label="Clave" required hint="Mayúsculas, números o _">
              <TextInput mono value={form.key} onChange={(v) => set('key')(v.toUpperCase())} />
            </FormField>
            <FormField label="Proyecto Jira" required>
              <TextInput mono value={form.jiraProjectKey} onChange={(v) => set('jiraProjectKey')(v.toUpperCase())} />
            </FormField>
          </Grid>
          <FormField label="Nombre" required>
            <TextInput value={form.name} onChange={set('name')} />
          </FormField>
          <FormField label="Descripción" optional>
            <Textarea rows={2} value={form.description} onChange={set('description')} />
          </FormField>
          <Grid cols={3} gap={15}>
            <FormField label="Modo">
              <Select value={form.mode} onChange={set('mode')} options={[{ value: 'DEMO', label: 'Demo (datos ficticios)' }, { value: 'JIRA', label: 'Jira real' }]} />
            </FormField>
            <FormField label="Conexión" required={form.mode === 'JIRA'}>
              <Select value={form.connectionKey} onChange={set('connectionKey')} placeholder="Ninguna" options={(connections ?? []).map((c) => ({ value: c.key, label: c.name }))} />
            </FormField>
            <FormField label="Proveedor de IA">
              <Select value={form.providerKey} onChange={set('providerKey')} placeholder="Predeterminado" options={(providers ?? []).map((p) => ({ value: p.key, label: p.name }))} />
            </FormField>
          </Grid>
        </div>
      </Modal>
    </div>
  );
}
