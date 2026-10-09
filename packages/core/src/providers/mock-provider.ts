import type { TaskType } from '@mao/shared';
import { PlatformError } from '../util/errors';
import { functionalAnalysis, generateStories, summarizeContext } from './mock/epic';
import { storyImprovements, storyReview } from './mock/story';
import { designCapability, planRequest, supervisorReview } from './mock/supervisor';
import { dependencyPlan, qaCoverage, technicalBreakdown, validatePlan } from './mock/tech';
import type { IModelProvider, ModelInvocation, ModelResult, ProviderDiagnosis } from './types';

const HANDLERS: Record<TaskType, (ctx: Record<string, any>) => unknown> = {
  summarize_context: summarizeContext,
  functional_analysis: functionalAnalysis,
  generate_stories: generateStories,
  technical_breakdown: technicalBreakdown,
  validate_plan: validatePlan,
  dependency_plan: dependencyPlan,
  story_review: storyReview,
  story_improvements: storyImprovements,
  qa_coverage: qaCoverage,
  supervisor_review: supervisorReview,
  plan_request: planRequest,
  design_capability: designCapability,
};

/**
 * Proveedor SIMULADO: heurísticas determinísticas sobre el contexto estructurado.
 * Sirve para demos y pruebas reproducibles; todos sus resultados se marcan `simulated: true`.
 */
export class MockModelProvider implements IModelProvider {
  readonly kind = 'MOCK' as const;

  constructor(private readonly opts: { latencyMs?: number; failTimes?: Partial<Record<TaskType, number>> } = {}) {}

  private failures = new Map<string, number>();

  async diagnose(): Promise<ProviderDiagnosis> {
    return { status: 'AVAILABLE', detail: 'Simulación determinística (no usa ningún modelo de IA).', checks: [{ name: 'mock', ok: true, detail: 'Siempre disponible' }] };
  }

  async invoke(inv: ModelInvocation): Promise<ModelResult> {
    const started = Date.now();
    if (inv.signal?.aborted) throw new PlatformError('CANCELLED', 'Invocación cancelada');
    const failTimes = this.opts.failTimes?.[inv.task] ?? 0;
    // La correlación termina en ":<intento>": los fallos simulados se cuentan por etapa, no por intento.
    const k = `${inv.correlationId.replace(/:\d+$/, '')}:${inv.task}`;
    const done = this.failures.get(k) ?? 0;
    if (done < failTimes) {
      this.failures.set(k, done + 1);
      throw new PlatformError('MODEL_RATE_LIMIT', `Fallo simulado ${done + 1}/${failTimes} (prueba de reintentos)`);
    }
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const handler = HANDLERS[inv.task];
    if (!handler) throw new PlatformError('TOOL_UNAVAILABLE', `El proveedor simulado no implementa la tarea ${inv.task}`);
    const output = handler(inv.context);
    return { output, simulated: true, provider: 'MOCK', model: 'mock-heuristics-v1', durationMs: Date.now() - started, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  }
}
