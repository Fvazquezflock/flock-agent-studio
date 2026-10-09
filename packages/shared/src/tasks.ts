import { z } from 'zod';
import { SPECIALTIES } from './enums';

/**
 * Contratos de las tareas que resuelven los agentes. La salida de cada invocación se valida contra
 * estos esquemas: una respuesta que no cumple es INVALID_RESPONSE (reintentable).
 * Los campos `evidence`/`source` registran referencias verificables, nunca razonamiento privado.
 */

const evidence = z.array(z.string()).default([]);

/** Recomendación de cancelar una historia existente (se ejecuta como transición en Jira, con aprobación individual). */
export const cancellationSchema = z.object({
  reason: z.enum(['DUPLICATE', 'OUT_OF_SCOPE', 'OBSOLETE']),
  explanation: z.string().describe('Qué inconsistencia se encontró y por qué la historia sobra'),
  duplicateOf: z.string().optional().describe('Si es duplicada, la clave de la historia que ya cubre lo mismo'),
  evidence,
});
export type Cancellation = z.infer<typeof cancellationSchema>;

export const contextSummaryOutput = z.object({
  summary: z.string(),
  keyFacts: z.array(z.object({ fact: z.string(), source: z.string() })).default([]),
  existingItems: z.array(z.object({ key: z.string(), type: z.string(), summary: z.string() })).default([]),
  gaps: z.array(z.string()).default([]),
  untrustedContentWarnings: z.array(z.string()).default([]),
});

export const functionalAnalysisOutput = z.object({
  objectives: z.array(z.string()),
  capabilities: z.array(z.object({ name: z.string(), description: z.string(), source: z.string() })),
  businessRules: z.array(z.object({ rule: z.string(), source: z.string() })).default([]),
  missingFunctionality: z.array(z.string()).default([]),
  ambiguities: z.array(z.object({ text: z.string(), question: z.string() })).default([]),
  openQuestions: z.array(z.string()).default([]),
  obsoleteItems: z
    .array(cancellationSchema.extend({ key: z.string().describe('Clave de la historia existente de la épica que sobra') }))
    .default([])
    .describe('Historias existentes de la épica que conviene cancelar: duplicadas de otra, fuera del alcance de la épica u obsoletas. Solo con evidencia concreta; si no hay, lista vacía.'),
});

export const storyProposalSchema = z.object({
  ref: z.string(),
  title: z.string().min(3),
  description: z.string(),
  objective: z.string(),
  actor: z.string().optional(),
  expectedBehavior: z.string(),
  acceptanceCriteria: z.array(z.string()),
  businessRules: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  questions: z.array(z.string()).default([]),
  epicRelation: z.string(),
  rationale: z
    .string()
    .default('')
    .describe('Por qué se crea: qué capacidad, regla de negocio o requisito de la épica no cubren las historias existentes (citá la sección o la clave).'),
  evidence,
});
export type StoryProposal = z.infer<typeof storyProposalSchema>;

export const storiesOutput = z.object({
  stories: z.array(storyProposalSchema),
  notes: z.array(z.string()).default([]),
});

export const taskProposalSchema = z.object({
  ref: z.string(),
  storyRef: z.string(),
  specialty: z.enum(SPECIALTIES),
  title: z.string().min(3),
  objective: z.string(),
  scope: z.string(),
  activities: z.array(z.string()),
  doneCriteria: z.array(z.string()),
  dependencies: z.array(z.string()).default([]),
  risks: z.array(z.string()).default([]),
  /** Si equivale a una tarea existente en Jira, su clave (se evita duplicarla). */
  duplicateOf: z.string().optional(),
  rationale: z.string().default('').describe('Por qué se crea: qué criterio de aceptación, regla o necesidad técnica de la historia cubre y que no cubren las tareas existentes.'),
  evidence,
});
export type TaskProposal = z.infer<typeof taskProposalSchema>;

export const technicalBreakdownOutput = z.object({
  tasks: z.array(taskProposalSchema),
  notApplicable: z.array(z.object({ storyRef: z.string(), reason: z.string() })).default([]),
});

export const validationIssueSchema = z.object({
  severity: z.enum(['error', 'warning', 'info']),
  type: z.enum(['DUPLICATE', 'CONTRADICTION', 'TOO_BROAD', 'MISSING_AC', 'DEPENDENCY', 'INCONSISTENCY', 'NEEDS_CLARIFICATION', 'COVERAGE']),
  refs: z.array(z.string()).default([]),
  message: z.string(),
  suggestion: z.string().default(''),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export const validationOutput = z.object({
  verdict: z.enum(['OK', 'NEEDS_ATTENTION']),
  issues: z.array(validationIssueSchema),
  qaTasks: z.array(taskProposalSchema).default([]),
  coverage: z.array(z.object({ storyRef: z.string(), covered: z.boolean(), notes: z.string().default('') })).default([]),
});

export const dependencyPlanOutput = z.object({
  waves: z.array(z.object({ wave: z.number().int(), refs: z.array(z.string()) })),
  dependencies: z.array(z.object({ from: z.string(), to: z.string(), type: z.enum(['blocks', 'relates']), reason: z.string() })),
  cycles: z.array(z.array(z.string())).default([]),
  notes: z.array(z.string()).default([]),
});

export const storyReviewOutput = z.object({
  diagnosis: z.object({
    summary: z.string(),
    readiness: z.enum(['READY', 'PARTIAL', 'NOT_READY']),
    score: z.number().min(0).max(100).describe('Puntaje entero de 0 a 100 (100 = lista para planificar)'),
  }),
  problems: z.array(
    z.object({
      id: z.string(),
      area: z.enum(['CLARITY', 'COMPLETENESS', 'COHERENCE', 'AMBIGUITY', 'ACCEPTANCE_CRITERIA', 'ALTERNATIVE_FLOWS', 'VALIDATIONS', 'DEPENDENCIES', 'DOR']),
      severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
      description: z.string(),
      evidence: z.string().default(''),
    }),
  ),
  dorChecklist: z.array(z.object({ item: z.string(), met: z.boolean(), note: z.string().default('') })).default([]),
  cancellation: cancellationSchema
    .nullable()
    .default(null)
    .describe('Solo si la HU sobra (duplicada de otra, fuera del alcance de la épica u obsoleta), con evidencia concreta; si no, null.'),
});

export const storyImprovementsOutput = z.object({
  changes: z.array(
    z.object({
      field: z.enum(['summary', 'description', 'acceptanceCriteria']),
      original: z.string(),
      proposed: z.string(),
      justification: z.string(),
      problemIds: z.array(z.string()).default([]),
    }),
  ),
});

export const qaCoverageOutput = z.object({
  coverage: z.array(z.object({ criterion: z.string(), coveredBy: z.array(z.string()), gap: z.string().optional() })),
  missingTests: z.array(z.string()).default([]),
  qaTasks: z.array(taskProposalSchema).default([]),
  issues: z.array(validationIssueSchema).default([]),
});

export const capabilityGapSchema = z.object({
  kind: z.enum(['AGENT', 'SKILL', 'ORCHESTRATOR', 'MODIFICATION']),
  action: z
    .enum(['CREATE', 'UPDATE', 'CANCEL'])
    .default('CREATE')
    .describe('CREATE: la capacidad no existe en el catálogo. UPDATE: existe (targetKey) pero tiene una inconsistencia o le falta algo: se propone una nueva versión completa. CANCEL: existe pero sobra (duplicada, contradictoria u obsoleta): se propone dejar de usarla.'),
  /** Inconsistencias o brechas concretas que motivan la propuesta (referencias verificables). */
  evidence: z.array(z.string()).default([]).describe('Qué inconsistencia o brecha concreta se encontró, con referencia (issue, regla, etapa o capacidad existente)'),
  targetKey: z.string(),
  title: z.string(),
  problem: z.string(),
  justification: z.string(),
  solution: z.string(),
  /** Definición completa propuesta (AgentDefinition | SkillDefinition | OrchestratorDefinition). */
  definition: z
    .record(z.string(), z.unknown())
    .describe(
      'Definición completa de la capacidad. Para SKILL: {"name":"…","description":"…","instructions":"Markdown con el contenido de la skill (obligatorio)","rules":["…"],"constraints":["…"],"examples":[{"title":"…","content":"…"}],"templates":[{"name":"…","content":"…"}],"appliesTo":{"tasks":["technical_breakdown"],"technologies":["…"]},"tags":["…"]}. name e instructions son obligatorios. Tareas válidas para appliesTo.tasks: functional_analysis, generate_stories, technical_breakdown, validate_plan, dependency_plan, story_review, story_improvements, qa_coverage. Sin código ejecutable ni comandos.',
    ),
  tools: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  impact: z.string(),
  risks: z.array(z.string()).default([]),
  tests: z.array(z.string()).default([]),
});
export type CapabilityGap = z.infer<typeof capabilityGapSchema>;

export const supervisorReviewOutput = z.object({
  qualityScore: z.number().min(0).max(100).describe('Puntaje entero de 0 a 100, no una fracción de 0 a 1'),
  summary: z.string(),
  conflicts: z.array(z.object({ between: z.array(z.string()), description: z.string(), resolution: z.string() })).default([]),
  recommendations: z.array(z.string()).default([]),
  capabilityGaps: z.array(capabilityGapSchema).default([]),
});

export const supervisorPlanOutput = z.object({
  orchestratorKey: z.string().nullable(),
  projectKey: z.string().nullable(),
  input: z.record(z.string(), z.string()).describe('Entrada del orquestador elegido, por ejemplo {"epicKey":"SCRUM-5"} o {"storyKey":"SCRUM-7"}'),
  rationale: z.string(),
  confidence: z.number().min(0).max(1).describe('Fracción de 0 a 1'),
  steps: z.array(z.string()).default([]),
  missingCapability: z.string().optional(),
});
export type SupervisorPlan = z.infer<typeof supervisorPlanOutput>;

export const TASK_CONTRACTS = {
  summarize_context: { label: 'Resumen de contexto Jira', output: contextSummaryOutput },
  functional_analysis: { label: 'Análisis funcional', output: functionalAnalysisOutput },
  generate_stories: { label: 'Generación de historias', output: storiesOutput },
  technical_breakdown: { label: 'Descomposición técnica', output: technicalBreakdownOutput },
  validate_plan: { label: 'Validación de historias y tareas', output: validationOutput },
  dependency_plan: { label: 'Plan de dependencias', output: dependencyPlanOutput },
  story_review: { label: 'Validación funcional de HU', output: storyReviewOutput },
  story_improvements: { label: 'Propuestas de mejora de HU', output: storyImprovementsOutput },
  qa_coverage: { label: 'Cobertura QA', output: qaCoverageOutput },
  supervisor_review: { label: 'Revisión del supervisor', output: supervisorReviewOutput },
  plan_request: { label: 'Planificación de solicitud', output: supervisorPlanOutput },
  design_capability: { label: 'Diseño de capacidad', output: capabilityGapSchema },
} as const;
export type TaskType = keyof typeof TASK_CONTRACTS;
export const TASK_TYPES = Object.keys(TASK_CONTRACTS) as TaskType[];

export function taskOutputJsonSchema(task: TaskType): Record<string, unknown> {
  return z.toJSONSchema(TASK_CONTRACTS[task].output, { io: 'input' }) as Record<string, unknown>;
}
