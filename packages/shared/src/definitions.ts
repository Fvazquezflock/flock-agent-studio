import { z } from 'zod';
import { GRANTABLE_TOOLS, OPERATION_TYPES, SPECIALTIES, STEP_HANDLERS } from './enums';

const key = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'Usá letras, números, "_" o "-" y empezá con una letra');

// ---------- Agentes ----------

export const agentLimitsSchema = z.object({
  timeoutMs: z.number().int().min(5_000).max(900_000).default(180_000),
  maxAttempts: z.number().int().min(1).max(5).default(3),
  maxBudgetUsd: z.number().positive().max(20).default(0.5),
  maxTurns: z.number().int().min(1).max(10).default(1),
});

export const agentDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  objective: z.string().max(2000).default(''),
  responsibilities: z.array(z.string().min(1)).default([]),
  systemPrompt: z.string().min(1).max(40_000),
  /** DEFAULT = usa el proveedor de la ejecución. */
  provider: z.enum(['DEFAULT', 'MOCK', 'LOCAL_CLAUDE', 'ANTHROPIC_API']).default('DEFAULT'),
  model: z.string().max(120).default('default'),
  parameters: z
    .object({
      temperature: z.number().min(0).max(1).optional(),
      maxOutputTokens: z.number().int().min(256).max(64_000).optional(),
      effort: z.enum(['low', 'medium', 'high']).optional(),
    })
    .prefault({}),
  allowedTools: z.array(z.enum(GRANTABLE_TOOLS)).default([]),
  skills: z.array(key).default([]),
  delegates: z.array(key).default([]),
  /** Tareas (contratos de entrada/salida) que el agente sabe resolver. */
  tasks: z.array(z.string().min(1)).default([]),
  inputSchema: z.record(z.string(), z.unknown()).default({}),
  outputSchema: z.record(z.string(), z.unknown()).default({}),
  constraints: z.array(z.string().min(1)).default([]),
  limits: agentLimitsSchema.prefault({}),
  tags: z.array(z.string()).default([]),
});
export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

// ---------- Skills ----------

export const skillDefinitionSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  /** Cuerpo Markdown (equivalente al contenido de SKILL.md). */
  instructions: z.string().min(1).max(60_000),
  rules: z.array(z.string().min(1)).default([]),
  examples: z.array(z.object({ title: z.string(), content: z.string() })).default([]),
  templates: z.array(z.object({ name: z.string(), content: z.string() })).default([]),
  references: z.array(z.object({ title: z.string(), content: z.string() })).default([]),
  constraints: z.array(z.string().min(1)).default([]),
  appliesTo: z
    .object({
      tasks: z.array(z.string()).default([]),
      technologies: z.array(z.string()).default([]),
    })
    .prefault({}),
  tags: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type SkillDefinition = z.infer<typeof skillDefinitionSchema>;

// ---------- Orquestadores ----------

export const orchestratorInputFieldSchema = z.object({
  key: key,
  label: z.string().min(1),
  type: z.enum(['string', 'text', 'issueKey', 'projectKey']).default('string'),
  required: z.boolean().default(false),
  description: z.string().default(''),
});

export const stepConditionSchema = z.object({
  step: key,
  path: z.string().min(1),
  op: z.enum(['exists', 'notEmpty', 'equals', 'notEquals']),
  value: z.unknown().optional(),
});

export const orchestratorStepSchema = z.object({
  key: key,
  name: z.string().min(1),
  description: z.string().default(''),
  handler: z.enum(STEP_HANDLERS),
  agentKey: key.optional(),
  skillKeys: z.array(key).default([]),
  task: z.string().optional(),
  /** Pasos cuyas salidas se entregan como entrada (además de dependsOn). */
  inputs: z.array(key).default([]),
  dependsOn: z.array(key).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
  runIf: stepConditionSchema.optional(),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).max(5).default(3),
      backoffMs: z.number().int().min(100).max(300_000).default(2_000),
    })
    .prefault({}),
  onError: z.enum(['fail', 'continue']).default('fail'),
  /** Si es seguro ejecutarlo en paralelo con otros pasos listos. */
  parallelSafe: z.boolean().default(true),
});
export type OrchestratorStepDefinition = z.infer<typeof orchestratorStepSchema>;

export const orchestratorDefinitionSchema = z.object({
  name: z.string().min(1).max(160),
  objective: z.string().min(1),
  description: z.string().default(''),
  useConditions: z.array(z.string()).default([]),
  /** Palabras clave que ayudan al supervisor a elegir el flujo (metadatos de descubrimiento). */
  keywords: z.array(z.string()).default([]),
  inputSchema: z.object({ fields: z.array(orchestratorInputFieldSchema).default([]) }).prefault({}),
  steps: z.array(orchestratorStepSchema).min(1),
  approvalConditions: z
    .object({
      operationTypes: z.array(z.enum(OPERATION_TYPES)).default([]),
      notes: z.string().default(''),
    })
    .prefault({}),
  errorHandling: z
    .object({
      defaultMaxAttempts: z.number().int().min(1).max(5).default(3),
      backoffMs: z.number().int().min(100).max(300_000).default(2_000),
      notes: z.string().default(''),
    })
    .prefault({}),
  resultSchema: z
    .object({
      description: z.string().default(''),
      fields: z.array(z.object({ key: z.string(), description: z.string() })).default([]),
    })
    .prefault({}),
  tags: z.array(z.string()).default([]),
});
export type OrchestratorDefinition = z.infer<typeof orchestratorDefinitionSchema>;

// ---------- Configuración de proyecto ----------

export const projectConfigSchema = z.object({
  language: z.string().default('es-AR'),
  jira: z
    .object({
      issueTypes: z
        .object({
          epic: z.string().default('Epic'),
          story: z.string().default('Story'),
          task: z.string().default('Task'),
          subtask: z.string().default('Sub-task'),
        })
        .prefault({}),
      /** Cómo cuelgan las tareas técnicas de la historia. */
      taskHierarchy: z.enum(['subtask', 'parent', 'link']).default('subtask'),
      /** Cómo se relaciona la historia con la épica. */
      storyEpicLink: z.enum(['parent', 'epic_link']).default('parent'),
      linkTypes: z
        .object({
          blocks: z.string().default('Blocks'),
          relates: z.string().default('Relates'),
        })
        .prefault({}),
      requiredFields: z.array(z.string()).default([]),
      /** Solo ids de campos descubiertos por el conector; nunca inventados. */
      customFields: z.array(z.object({ fieldId: z.string(), name: z.string(), purpose: z.string() })).default([]),
      statuses: z.array(z.string()).default([]),
      transitions: z.array(z.object({ from: z.string(), to: z.string(), name: z.string() })).default([]),
      /** Transición descubierta con el conector que se usa para cancelar una HU (nunca inventada). */
      cancelTransition: z.object({ id: z.string(), name: z.string() }).optional(),
      correlationLabel: z.boolean().default(true),
      discovered: z
        .object({
          at: z.string(),
          issueTypes: z.array(z.object({ id: z.string(), name: z.string(), subtask: z.boolean().optional() })),
          fields: z.array(z.object({ id: z.string(), name: z.string(), custom: z.boolean().optional() })),
          /** Transiciones disponibles para una historia de muestra (el flujo de trabajo puede variar por issue). */
          transitions: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
          transitionsFrom: z.string().optional(),
        })
        .optional(),
    })
    .prefault({}),
  templates: z
    .object({
      storyTitle: z.string().default('{{actor}} — {{capacidad}}'),
      storyDescription: z
        .string()
        .default(
          '## Objetivo\n{{objective}}\n\n## Comportamiento esperado\n{{expectedBehavior}}\n\n## Criterios de aceptación\n{{acceptanceCriteria}}\n\n## Reglas de negocio\n{{businessRules}}\n\n## Supuestos y dudas\n{{assumptions}}',
        ),
      acceptanceCriteriaFormat: z.enum(['gherkin', 'checklist']).default('gherkin'),
      minAcceptanceCriteria: z.number().int().min(1).max(20).default(2),
      taskTitlePrefix: z
        .object({ BACKEND: z.string().default('[BE]'), FRONTEND: z.string().default('[FE]'), FULLSTACK: z.string().default('[FS]'), QA: z.string().default('[QA]') })
        .prefault({}),
    })
    .prefault({}),
  storyPoints: z
    .object({
      enabled: z.boolean().default(false),
      scale: z.array(z.number()).default([1, 2, 3, 5, 8, 13]),
      fieldId: z.string().optional(),
    })
    .prefault({}),
  definitionOfReady: z.array(z.string()).default([]),
  definitionOfDone: z.array(z.string()).default([]),
  technologies: z.array(z.string()).default([]),
  specialties: z.array(z.enum(SPECIALTIES)).default(['BACKEND', 'FRONTEND', 'FULLSTACK', 'QA']),
  rules: z.array(z.string()).default([]),
  /** Vacío = todos los activos. */
  enabledAgents: z.array(z.string()).default([]),
  enabledSkills: z.array(z.string()).default([]),
  enabledOrchestrators: z.array(z.string()).default([]),
  /** Skills extra que se inyectan a todos los agentes de este proyecto. */
  projectSkills: z.array(z.string()).default([]),
});
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

export const globalConfigSchema = z.object({
  limits: z
    .object({
      maxConcurrentExecutions: z.number().int().min(1).max(16).default(2),
      maxStepAttempts: z.number().int().min(1).max(5).default(3),
      defaultStepTimeoutMs: z.number().int().min(5_000).max(900_000).default(180_000),
      maxBudgetUsdPerExecution: z.number().positive().default(3),
    })
    .prefault({}),
  security: z
    .object({
      /** Reglas obligatorias: ningún proyecto u operación puede superarlas. */
      mandatory: z
        .object({
          allowDeleteExternal: z.literal(false).default(false),
          allowAgentWriteTools: z.literal(false).default(false),
          requireApprovalForActivation: z.literal(true).default(true),
        })
        .prefault({}),
    })
    .prefault({}),
  defaults: projectConfigSchema.partial().default({}),
});
export type GlobalConfig = z.infer<typeof globalConfigSchema>;
