import type { ProviderKind, TaskType } from '@mao/shared';

export interface ModelInvocation {
  agentKey: string;
  task: TaskType;
  systemPrompt: string;
  userPrompt: string;
  /** JSON Schema de la salida esperada (derivado del contrato Zod de la tarea). */
  outputJsonSchema: Record<string, unknown>;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  maxOutputTokens?: number;
  timeoutMs: number;
  maxBudgetUsd?: number;
  signal?: AbortSignal;
  correlationId: string;
  /**
   * Contexto estructurado de la tarea. Los proveedores reales lo reciben serializado en userPrompt;
   * el proveedor simulado lo usa directamente para producir resultados determinísticos.
   */
  context: Record<string, unknown>;
}

export interface ModelUsage {
  /** Entrada sin caché. */
  inputTokens?: number;
  outputTokens?: number;
  /** Entrada escrita en la caché de prompts (en esta plataforma suele ser la mayor parte de la entrada). */
  cacheCreationInputTokens?: number;
  /** Entrada leída de la caché de prompts. */
  cacheReadInputTokens?: number;
  /** Estimación informada por el proveedor (equivalente API). Con suscripción de claude.ai no es un cargo. */
  costUsd?: number;
}

export interface ModelResult {
  output: unknown;
  /** true = resultado del proveedor simulado (nunca presentarlo como real). */
  simulated: boolean;
  provider: ProviderKind;
  model: string;
  durationMs: number;
  usage?: ModelUsage;
  sessionId?: string;
}

export interface DiagnosisCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface ProviderDiagnosis {
  status: 'AVAILABLE' | 'NOT_CONFIGURED' | 'ERROR';
  detail: string;
  checks: DiagnosisCheck[];
}

export interface IModelProvider {
  readonly kind: ProviderKind;
  diagnose(deep?: boolean): Promise<ProviderDiagnosis>;
  invoke(inv: ModelInvocation): Promise<ModelResult>;
}
