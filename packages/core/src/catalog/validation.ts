import {
  GRANTABLE_TOOLS,
  TASK_TYPES,
  agentDefinitionSchema,
  orchestratorDefinitionSchema,
  skillDefinitionSchema,
  type AgentDefinition,
  type OrchestratorDefinition,
  type SkillDefinition,
} from '@mao/shared';
import type { z } from 'zod';

export type CatalogKind = 'agent' | 'skill' | 'orchestrator';

export interface ValidationResult<T = unknown> {
  valid: boolean;
  errors: string[];
  warnings: string[];
  value?: T;
  /** Solo orquestadores: capas topológicas (pasos que pueden correr en paralelo). */
  layers?: string[][];
}

/** Datos mínimos del catálogo para validar referencias cruzadas. */
export interface CatalogIndex {
  agents: Map<string, { tasks: string[]; status: string }>;
  skills: Map<string, { status: string }>;
}

export const APPROVAL_BUILDERS = ['epic_publication', 'story_publication'] as const;
export const CONTEXT_MODES = ['epic', 'story'] as const;

function zodErrors(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || '(raíz)'}: ${i.message}`);
}

// ---------- Escaneo de seguridad de textos (prompts, instrucciones, propuestas) ----------

const SAFETY_PATTERNS: { re: RegExp; message: string }[] = [
  { re: /\b(npm|pnpm|yarn|pip|uv|choco|winget)\s+(install|add|i)\b/i, message: 'Instala dependencias o software' },
  { re: /\b(curl|wget|Invoke-WebRequest|iwr|Invoke-RestMethod)\b/i, message: 'Descarga o llama a recursos externos' },
  { re: /\b(rm\s+-rf|del\s+\/[sqf]|Remove-Item|rmdir|format\s+[a-z]:)/i, message: 'Comando destructivo de sistema' },
  { re: /\b(powershell|pwsh|cmd(\.exe)?|bash|sh)\s+(-c|\/c|-Command)\b/i, message: 'Ejecuta comandos de sistema' },
  { re: /```\s*(bash|sh|shell|powershell|ps1|pwsh|cmd|bat)\b/i, message: 'Incluye scripts de shell ejecutables' },
  { re: /\b(eval|exec|child_process|subprocess|os\.system)\s*\(/i, message: 'Incluye código ejecutable' },
  { re: /(dangerously-skip-permissions|bypassPermissions|--allow-dangerously)/i, message: 'Intenta saltear permisos' },
  { re: /\bjira_(create|update|delete|transition|move|add_comment)/i, message: 'Referencia herramientas de escritura de Jira' },
  { re: /(^|[^a-záéíóú])(ignor[aáe]r?|ignore)\s+(todas\s+)?(las\s+|all\s+)?(instrucciones|instructions|pol[ií]ticas|policies|reglas|rules)/i, message: 'Instrucción para ignorar políticas' },
];

export function safetyScan(text: string): string[] {
  const found = new Set<string>();
  for (const p of SAFETY_PATTERNS) if (p.re.test(text)) found.add(p.message);
  return [...found];
}

function collectText(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectText(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => collectText(v, acc));
  return acc;
}

// ---------- Agentes y skills ----------

export function validateAgentDefinition(input: unknown, index?: CatalogIndex, selfKey?: string): ValidationResult<AgentDefinition> {
  const parsed = agentDefinitionSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: zodErrors(parsed.error), warnings: [] };
  const def = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const t of def.tasks) if (!(TASK_TYPES as string[]).includes(t)) warnings.push(`Tarea desconocida para el motor: ${t}`);
  for (const tool of def.allowedTools) if (!(GRANTABLE_TOOLS as readonly string[]).includes(tool)) errors.push(`Herramienta no otorgable: ${tool}`);
  if (index) {
    for (const s of def.skills) if (!index.skills.has(s)) errors.push(`Skill inexistente: ${s}`);
    for (const d of def.delegates) {
      if (d === selfKey) errors.push('Un agente no puede delegarse a sí mismo');
      else if (!index.agents.has(d)) errors.push(`Agente delegable inexistente: ${d}`);
    }
  }
  const scan = safetyScan(collectText([def.systemPrompt, def.constraints, def.responsibilities]).join('\n'));
  for (const s of scan) warnings.push(`Revisión de seguridad: ${s}`);
  return { valid: errors.length === 0, errors, warnings, value: def };
}

export function validateSkillDefinition(input: unknown): ValidationResult<SkillDefinition> {
  const parsed = skillDefinitionSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: zodErrors(parsed.error), warnings: [] };
  const warnings = safetyScan(collectText(parsed.data).join('\n')).map((s) => `Revisión de seguridad: ${s}`);
  return { valid: true, errors: [], warnings, value: parsed.data };
}

// ---------- Orquestadores: DAG ----------

/** Capas topológicas (Kahn). Devuelve null si hay ciclo, junto con los nodos involucrados. */
export function topologicalLayers(nodes: string[], deps: Map<string, string[]>): { layers: string[][] | null; cyclic: string[] } {
  const indeg = new Map(nodes.map((n) => [n, 0]));
  const children = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const n of nodes) {
    for (const d of deps.get(n) ?? []) {
      if (!indeg.has(d)) continue;
      indeg.set(n, (indeg.get(n) ?? 0) + 1);
      children.get(d)!.push(n);
    }
  }
  const layers: string[][] = [];
  let frontier = nodes.filter((n) => indeg.get(n) === 0);
  let seen = 0;
  while (frontier.length) {
    layers.push(frontier);
    seen += frontier.length;
    const next: string[] = [];
    for (const n of frontier) {
      for (const c of children.get(n)!) {
        indeg.set(c, indeg.get(c)! - 1);
        if (indeg.get(c) === 0) next.push(c);
      }
    }
    frontier = next;
  }
  if (seen !== nodes.length) return { layers: null, cyclic: nodes.filter((n) => (indeg.get(n) ?? 0) > 0) };
  return { layers, cyclic: [] };
}

function ancestors(key: string, deps: Map<string, string[]>, acc = new Set<string>()): Set<string> {
  for (const d of deps.get(key) ?? []) {
    if (!acc.has(d)) {
      acc.add(d);
      ancestors(d, deps, acc);
    }
  }
  return acc;
}

export function validateOrchestratorDefinition(input: unknown, index?: CatalogIndex): ValidationResult<OrchestratorDefinition> {
  const parsed = orchestratorDefinitionSchema.safeParse(input);
  if (!parsed.success) return { valid: false, errors: zodErrors(parsed.error), warnings: [] };
  const def = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const keys = def.steps.map((s) => s.key);
  const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupes.length) errors.push(`Claves de etapa duplicadas: ${[...new Set(dupes)].join(', ')}`);
  const keySet = new Set(keys);

  // Las entradas también son dependencias: una etapa no puede leer la salida de otra que no terminó.
  const deps = new Map<string, string[]>();
  for (const s of def.steps) {
    const all = [...new Set([...s.dependsOn, ...s.inputs])];
    for (const d of all) if (!keySet.has(d)) errors.push(`La etapa "${s.key}" depende de una etapa inexistente: ${d}`);
    if (all.includes(s.key)) errors.push(`La etapa "${s.key}" depende de sí misma`);
    deps.set(s.key, all.filter((d) => keySet.has(d) && d !== s.key));
  }
  const { layers, cyclic } = topologicalLayers(keys, deps);
  if (!layers) errors.push(`El flujo tiene un ciclo entre: ${cyclic.join(', ')}`);

  for (const s of def.steps) {
    switch (s.handler) {
      case 'agent.task':
        if (!s.agentKey) errors.push(`La etapa "${s.key}" requiere un agente responsable`);
        if (!s.task) errors.push(`La etapa "${s.key}" requiere una tarea`);
        else if (!(TASK_TYPES as string[]).includes(s.task)) errors.push(`La etapa "${s.key}" usa una tarea desconocida: ${s.task}`);
        break;
      case 'supervisor.review':
        if (!s.agentKey) errors.push(`La etapa "${s.key}" requiere el agente supervisor`);
        break;
      case 'jira.context':
        if (!(CONTEXT_MODES as readonly string[]).includes(String(s.params.mode))) errors.push(`La etapa "${s.key}" requiere params.mode = epic | story`);
        break;
      case 'approval.gate':
        if (!(APPROVAL_BUILDERS as readonly string[]).includes(String(s.params.builder))) errors.push(`La etapa "${s.key}" requiere params.builder = ${APPROVAL_BUILDERS.join(' | ')}`);
        break;
      case 'jira.publish': {
        const anc = ancestors(s.key, deps);
        const gates = def.steps.filter((x) => x.handler === 'approval.gate' && anc.has(x.key));
        if (!gates.length) errors.push(`La etapa de publicación "${s.key}" debe depender de una etapa de aprobación`);
        break;
      }
    }
    if (s.runIf && !ancestors(s.key, deps).has(s.runIf.step)) errors.push(`La condición de "${s.key}" debe referirse a una etapa previa (${s.runIf.step})`);
    if (index && s.agentKey) {
      const agent = index.agents.get(s.agentKey);
      if (!agent) errors.push(`Agente inexistente en "${s.key}": ${s.agentKey}`);
      else {
        if (agent.status !== 'ACTIVE') warnings.push(`El agente ${s.agentKey} no está activo`);
        if (s.task && agent.tasks.length && !agent.tasks.includes(s.task)) errors.push(`El agente ${s.agentKey} no declara la tarea ${s.task}`);
      }
    }
    if (index) for (const sk of s.skillKeys) if (!index.skills.has(sk)) errors.push(`Skill inexistente en "${s.key}": ${sk}`);
  }
  if (!def.steps.some((s) => s.handler === 'approval.gate') && def.steps.some((s) => s.handler === 'jira.publish')) {
    errors.push('Un flujo que publica en Jira debe incluir una etapa de aprobación');
  }
  return { valid: errors.length === 0, errors, warnings, value: def, layers: layers ?? undefined };
}

export function validateDefinition(kind: CatalogKind, input: unknown, index?: CatalogIndex, selfKey?: string): ValidationResult {
  if (kind === 'agent') return validateAgentDefinition(input, index, selfKey);
  if (kind === 'skill') return validateSkillDefinition(input);
  return validateOrchestratorDefinition(input, index);
}
