'use client';

import { GRANTABLE_TOOLS, STEP_HANDLERS, TASK_TYPES, TASK_CONTRACTS } from '@mao/shared';
import { useState } from 'react';
import { Button, IconButton } from '@/components/ui/core';
import { Col, Grid } from '@/components/ui/containers';
import { FlowGraph, JsonView, Markdown } from '@/components/ui/data';
import { CheckList, FormField, LinesInput, Select, TextInput, Textarea } from '@/components/ui/forms';
import { HANDLER_LABEL } from '@/lib/labels';

type Def = Record<string, any>;
interface Props {
  def: Def;
  set: (d: Def) => void;
  readOnly: boolean;
  catalog: { agents: any[]; skills: any[] };
}

const upd = (def: Def, set: (d: Def) => void, path: string[], value: unknown) => {
  const next = structuredClone(def);
  let cur = next;
  for (const k of path.slice(0, -1)) cur = cur[k] ??= {};
  cur[path[path.length - 1]] = value;
  set(next);
};

export function AgentForm({ def, set, readOnly, catalog }: Props) {
  const f = (path: string[]) => (v: unknown) => upd(def, set, path, v);
  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
      <Grid cols={2} gap={15}>
        <FormField label="Nombre" required>
          <TextInput value={def.name} onChange={f(['name'])} />
        </FormField>
        <FormField label="Modelo" hint='"default" usa el del proveedor'>
          <TextInput value={def.model ?? 'default'} onChange={f(['model'])} mono />
        </FormField>
      </Grid>
      <FormField label="Descripción">
        <Textarea rows={2} value={def.description} onChange={f(['description'])} />
      </FormField>
      <FormField label="Objetivo">
        <Textarea rows={2} value={def.objective} onChange={f(['objective'])} />
      </FormField>
      <FormField label="Prompt de sistema" required hint="Se combina con las reglas de plataforma (no negociables) y las skills asignadas aplicables a cada tarea.">
        <Textarea rows={8} value={def.systemPrompt} onChange={f(['systemPrompt'])} />
      </FormField>
      <FormField label="Responsabilidades" hint="Una por línea">
        <LinesInput value={def.responsibilities ?? []} onChange={f(['responsibilities'])} />
      </FormField>
      <FormField label="Restricciones" hint="Una por línea">
        <LinesInput value={def.constraints ?? []} onChange={f(['constraints'])} />
      </FormField>
      <Grid cols={3} gap={15}>
        <FormField label="Proveedor de IA">
          <Select
            value={def.provider ?? 'DEFAULT'}
            onChange={f(['provider'])}
            options={[
              { value: 'DEFAULT', label: 'El de la ejecución' },
              { value: 'LOCAL_CLAUDE', label: 'Claude Code local' },
              { value: 'ANTHROPIC_API', label: 'API de Anthropic' },
              { value: 'MOCK', label: 'Simulación' },
            ]}
          />
        </FormField>
        <FormField label="Esfuerzo">
          <Select value={def.parameters?.effort ?? ''} onChange={(v) => f(['parameters', 'effort'])(v || undefined)} placeholder="Predeterminado" options={['low', 'medium', 'high']} />
        </FormField>
        <FormField label="Máx. tokens de salida">
          <TextInput type="number" value={def.parameters?.maxOutputTokens ?? ''} onChange={(v) => f(['parameters', 'maxOutputTokens'])(v ? Number(v) : undefined)} />
        </FormField>
      </Grid>
      <FormField label="Tareas que resuelve">
        <CheckList columns={2} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_CONTRACTS[t].label, description: t }))} value={def.tasks ?? []} onChange={f(['tasks'])} />
      </FormField>
      <FormField label="Herramientas permitidas" hint="Solo lectura controlada. Las escrituras en Jira las hace el servicio de publicación tras aprobación.">
        <CheckList columns={3} options={GRANTABLE_TOOLS.map((t) => ({ value: t, label: t }))} value={def.allowedTools ?? []} onChange={f(['allowedTools'])} />
      </FormField>
      <FormField label="Skills asignadas">
        <CheckList columns={2} options={catalog.skills.map((s) => ({ value: s.key, label: s.name, description: `${s.key} · ${s.status}` }))} value={def.skills ?? []} onChange={f(['skills'])} />
      </FormField>
      <FormField label="Agentes delegables">
        <CheckList columns={3} options={catalog.agents.map((a) => ({ value: a.key, label: a.key }))} value={def.delegates ?? []} onChange={f(['delegates'])} />
      </FormField>
      <Grid cols={4} gap={15}>
        <FormField label="Timeout (ms)">
          <TextInput type="number" value={def.limits?.timeoutMs ?? 180000} onChange={(v) => f(['limits', 'timeoutMs'])(Number(v))} />
        </FormField>
        <FormField label="Intentos máx.">
          <TextInput type="number" value={def.limits?.maxAttempts ?? 3} onChange={(v) => f(['limits', 'maxAttempts'])(Number(v))} />
        </FormField>
        <FormField label="Presupuesto USD">
          <TextInput type="number" step="0.05" value={def.limits?.maxBudgetUsd ?? 0.5} onChange={(v) => f(['limits', 'maxBudgetUsd'])(Number(v))} />
        </FormField>
        <FormField label="Etiquetas" hint="Separadas por coma">
          <TextInput value={(def.tags ?? []).join(', ')} onChange={(v) => f(['tags'])(v.split(',').map((x) => x.trim()).filter(Boolean))} />
        </FormField>
      </Grid>
    </fieldset>
  );
}

export function SkillForm({ def, set, readOnly }: Props) {
  const f = (path: string[]) => (v: unknown) => upd(def, set, path, v);
  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
      <Grid cols={2} gap={15}>
        <FormField label="Nombre" required>
          <TextInput value={def.name} onChange={f(['name'])} />
        </FormField>
        <FormField label="Etiquetas" hint="Separadas por coma">
          <TextInput value={(def.tags ?? []).join(', ')} onChange={(v) => f(['tags'])(v.split(',').map((x) => x.trim()).filter(Boolean))} />
        </FormField>
      </Grid>
      <FormField label="Descripción">
        <Textarea rows={2} value={def.description} onChange={f(['description'])} />
      </FormField>
      <Grid cols={2} gap={15}>
        <FormField label="Instrucciones (Markdown, equivalente a SKILL.md)" required>
          <Textarea rows={16} mono value={def.instructions} onChange={f(['instructions'])} />
        </FormField>
        <div>
          <div className="fk-field__label mb-1">Vista previa</div>
          <div className="max-h-[400px] overflow-auto rounded-md border border-border bg-surface p-3">
            <Markdown text={def.instructions ?? ''} />
          </div>
        </div>
      </Grid>
      <FormField label="Reglas" hint="Una por línea">
        <LinesInput value={def.rules ?? []} onChange={f(['rules'])} />
      </FormField>
      <FormField label="Restricciones" hint="Una por línea">
        <LinesInput value={def.constraints ?? []} onChange={f(['constraints'])} />
      </FormField>
      <FormField label="Se carga solo para estas tareas" hint="Vacío = todas. La carga selectiva evita enviar prompts innecesarios.">
        <CheckList columns={2} options={TASK_TYPES.map((t) => ({ value: t, label: TASK_CONTRACTS[t].label }))} value={def.appliesTo?.tasks ?? []} onChange={f(['appliesTo', 'tasks'])} />
      </FormField>
      <FormField label="Tecnologías que cubre" hint="Separadas por coma (el supervisor las usa para detectar faltantes)">
        <TextInput value={(def.appliesTo?.technologies ?? []).join(', ')} onChange={(v) => f(['appliesTo', 'technologies'])(v.split(',').map((x) => x.trim()).filter(Boolean))} />
      </FormField>
      <PairsEditor label="Plantillas" value={def.templates ?? []} keyName="name" onChange={f(['templates'])} readOnly={readOnly} />
      <PairsEditor label="Ejemplos" value={def.examples ?? []} keyName="title" onChange={f(['examples'])} readOnly={readOnly} />
      <PairsEditor label="Documentos de referencia" value={def.references ?? []} keyName="title" onChange={f(['references'])} readOnly={readOnly} />
    </fieldset>
  );
}

function PairsEditor({ label, value, keyName, onChange, readOnly }: { label: string; value: Record<string, string>[]; keyName: string; onChange: (v: any[]) => void; readOnly: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="fk-field__label">{label}</span>
        {!readOnly && (
          <Button size="sm" variant="ghost" icon="plus" onClick={() => onChange([...value, { [keyName]: 'Nuevo', content: '' }])}>
            Agregar
          </Button>
        )}
      </div>
      {value.length === 0 && <span className="fk-text fk-text--sm fk-text--subtle">Sin elementos</span>}
      {value.map((v, i) => (
        <div key={i} className="flex flex-col gap-2 rounded-md border border-border p-3">
          <div className="flex gap-2">
            <TextInput value={v[keyName]} onChange={(t) => onChange(value.map((x, j) => (j === i ? { ...x, [keyName]: t } : x)))} className="flex-1" />
            {!readOnly && <IconButton icon="trash" label={`Quitar ${v[keyName]}`} onClick={() => onChange(value.filter((_, j) => j !== i))} />}
          </div>
          <Textarea rows={3} value={v.content} onChange={(t) => onChange(value.map((x, j) => (j === i ? { ...x, content: t } : x)))} />
        </div>
      ))}
    </div>
  );
}

/** Editor de orquestador basado en formularios + visualización del flujo (preparado para un editor visual futuro). */
export function OrchestratorForm({ def, set, readOnly, catalog }: Props) {
  const f = (path: string[]) => (v: unknown) => upd(def, set, path, v);
  const [sel, setSel] = useState<number>(0);
  const steps: Def[] = def.steps ?? [];
  const step = steps[sel];
  const setStep = (patch: Def) => f(['steps'])(steps.map((s, i) => (i === sel ? { ...s, ...patch } : s)));
  const agent = catalog.agents.find((a) => a.key === step?.agentKey);
  const agentTasks: string[] = agent?.activeVersion?.definition?.tasks ?? agent?.latestDefinition?.tasks ?? TASK_TYPES;
  const [paramsText, setParamsText] = useState<string | null>(null);
  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
      <Grid cols={2} gap={15}>
        <FormField label="Nombre" required>
          <TextInput value={def.name} onChange={f(['name'])} />
        </FormField>
        <FormField label="Palabras clave (descubrimiento del supervisor)" hint="Separadas por coma">
          <TextInput value={(def.keywords ?? []).join(', ')} onChange={(v) => f(['keywords'])(v.split(',').map((x) => x.trim()).filter(Boolean))} />
        </FormField>
      </Grid>
      <FormField label="Objetivo" required>
        <Textarea rows={2} value={def.objective} onChange={f(['objective'])} />
      </FormField>
      <FormField label="Descripción">
        <Textarea rows={2} value={def.description} onChange={f(['description'])} />
      </FormField>
      <FormField label="Condiciones de uso" hint="Una por línea">
        <LinesInput rows={3} value={def.useConditions ?? []} onChange={f(['useConditions'])} />
      </FormField>
      <FormField label="Esquema de entrada (campos)" hint="JSON: [{ key, label, type: string|text|issueKey, required }]">
        <JsonField value={def.inputSchema?.fields ?? []} onChange={(v) => f(['inputSchema', 'fields'])(v)} rows={5} />
      </FormField>
      <div className="flex min-w-0 flex-col gap-4">
        <div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="fk-h4">Etapas ({steps.length})</span>
              {!readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() => {
                    const key = `step_${steps.length + 1}`;
                    f(['steps'])([...steps, { key, name: 'Nueva etapa', handler: 'agent.task', agentKey: 'FunctionalAnalyst', task: 'functional_analysis', dependsOn: steps.length ? [steps[steps.length - 1].key] : [], params: {} }]);
                    setSel(steps.length);
                  }}
                >
                  Agregar etapa
                </Button>
              )}
            </div>
            <FlowGraph nodes={steps.map((s) => ({ key: s.key, name: s.name, handler: s.handler, agentKey: s.agentKey, dependsOn: [...(s.dependsOn ?? []), ...(s.inputs ?? [])] }))} selected={step?.key} onSelect={(k) => setSel(steps.findIndex((s) => s.key === k))} />
          </div>
        </div>
        <div>
          {step ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="fk-h4">Etapa: {step.name}</span>
                {!readOnly && (
                  <IconButton
                    icon="trash"
                    label="Eliminar etapa"
                    onClick={() => {
                      f(['steps'])(steps.filter((_, i) => i !== sel).map((s) => ({ ...s, dependsOn: (s.dependsOn ?? []).filter((d: string) => d !== step.key) })));
                      setSel(0);
                    }}
                  />
                )}
              </div>
              <Grid cols={2} gap={12}>
                <FormField label="Clave">
                  <TextInput mono value={step.key} onChange={(v) => setStep({ key: v.replace(/[^A-Za-z0-9_-]/g, '') })} />
                </FormField>
                <FormField label="Nombre">
                  <TextInput value={step.name} onChange={(v) => setStep({ name: v })} />
                </FormField>
                <FormField label="Tipo de etapa">
                  <Select value={step.handler} onChange={(v) => setStep({ handler: v })} options={STEP_HANDLERS.map((h) => ({ value: h, label: HANDLER_LABEL[h] }))} />
                </FormField>
                <FormField label="Agente responsable">
                  <Select value={step.agentKey ?? ''} onChange={(v) => setStep({ agentKey: v || undefined })} placeholder="Ninguno" options={catalog.agents.map((a) => a.key)} />
                </FormField>
                {step.handler === 'agent.task' && (
                  <FormField label="Tarea">
                    <Select value={step.task ?? ''} onChange={(v) => setStep({ task: v })} placeholder="Elegí una tarea" options={agentTasks.map((t) => ({ value: t, label: `${TASK_CONTRACTS[t as keyof typeof TASK_CONTRACTS]?.label ?? t} (${t})` }))} />
                  </FormField>
                )}
                <FormField label="Si falla">
                  <Select value={step.onError ?? 'fail'} onChange={(v) => setStep({ onError: v })} options={[{ value: 'fail', label: 'Detener el flujo' }, { value: 'continue', label: 'Continuar' }]} />
                </FormField>
              </Grid>
              <FormField label="Depende de">
                <CheckList columns={3} options={steps.filter((s) => s.key !== step.key).map((s) => ({ value: s.key, label: s.key }))} value={step.dependsOn ?? []} onChange={(v) => setStep({ dependsOn: v })} />
              </FormField>
              <FormField label="Skills adicionales">
                <CheckList columns={2} options={catalog.skills.map((s) => ({ value: s.key, label: s.key }))} value={step.skillKeys ?? []} onChange={(v) => setStep({ skillKeys: v })} />
              </FormField>
              <FormField label="Parámetros (JSON)" hint="jira.context: {mode}; approval.gate: {builder, regenerateFrom}; technical_breakdown: {specialty}">
                <Textarea
                  rows={4}
                  mono
                  value={paramsText ?? JSON.stringify(step.params ?? {}, null, 2)}
                  onChange={(t) => {
                    setParamsText(t);
                    try {
                      setStep({ params: JSON.parse(t) });
                    } catch {
                      /* se valida al guardar */
                    }
                  }}
                  onBlur={() => setParamsText(null)}
                />
              </FormField>
            </div>
          ) : (
            <p className="fk-text fk-text--muted">Agregá una etapa para empezar.</p>
          )}
        </div>
      </div>
      <details>
        <summary className="fk-link cursor-pointer">Manejo de errores, aprobación y resultado</summary>
        <div className="mt-3 grid gap-3">
          <JsonView value={{ approvalConditions: def.approvalConditions, errorHandling: def.errorHandling, resultSchema: def.resultSchema }} maxHeight={260} />
        </div>
      </details>
    </fieldset>
  );
}

export function JsonField({ value, onChange, rows = 18 }: { value: unknown; onChange: (v: any) => void; rows?: number }) {
  const [text, setText] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <FormField error={err}>
      <Textarea
        rows={rows}
        mono
        value={text ?? JSON.stringify(value, null, 2)}
        onChange={(t) => {
          setText(t);
          try {
            onChange(JSON.parse(t));
            setErr(null);
          } catch (e) {
            setErr(`JSON inválido: ${(e as Error).message}`);
          }
        }}
        onBlur={() => !err && setText(null)}
      />
    </FormField>
  );
}
