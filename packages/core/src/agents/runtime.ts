import { TASK_CONTRACTS, agentDefinitionSchema, skillDefinitionSchema, taskOutputJsonSchema, type AgentDefinition, type ProviderKind, type SkillDefinition, type TaskType } from '@mao/shared';
import type { ModelProviderConfiguration } from '@mao/db';
import type { Core } from '../core';
import { createProvider } from '../providers/registry';
import { reviveStructuredOutput } from '../providers/structured-schema';
import type { ModelResult } from '../providers/types';
import { PlatformError } from '../util/errors';
import { buildSystemPrompt, buildUserPrompt } from './prompts';

export interface PinnedRef {
  key: string;
  versionId: string;
  version: number;
  checksum: string;
}

export interface RunTaskInput {
  agentKey: string;
  task: TaskType;
  context: Record<string, unknown>;
  /** Versiones fijadas en la ejecución; si falta, se usa la versión activa (pruebas). */
  pinned?: { agents: PinnedRef[]; skills: PinnedRef[] };
  extraSkillKeys?: string[];
  executionProvider: ModelProviderConfiguration;
  correlationId: string;
  signal?: AbortSignal;
  /** Para probar una versión concreta (borrador) sin activarla. */
  agentVersionId?: string;
  /** Origen del consumo para el registro de tokens (ModelInvocation). */
  trace?: InvocationTrace;
}

export interface InvocationTrace {
  origin: 'EXECUTION' | 'SUPERVISOR_PLAN' | 'CATALOG_TEST' | 'PROPOSAL_REDESIGN';
  executionId?: string;
  stepKey?: string;
  attempt?: number;
}

export interface RunTaskResult {
  output: unknown;
  meta: {
    agentKey: string;
    agentVersionId: string;
    agentVersion: number;
    skills: { key: string; version: number }[];
    provider: ProviderKind;
    model: string;
    simulated: boolean;
    durationMs: number;
    usage?: ModelResult['usage'];
    sessionId?: string;
  };
}

/** Ejecuta una tarea de un agente: compone prompt + skills necesarias, invoca el proveedor y valida la salida. */
export class AgentRuntime {
  constructor(private readonly core: Core) {}

  private async loadAgent(input: RunTaskInput): Promise<{ id: string; version: number; def: AgentDefinition }> {
    const prisma = this.core.deps.prisma;
    let versionId = input.agentVersionId ?? input.pinned?.agents.find((a) => a.key === input.agentKey)?.versionId;
    if (!versionId) {
      const agent = await prisma.agent.findUnique({ where: { key: input.agentKey } });
      if (!agent?.activeVersionId || agent.status !== 'ACTIVE') throw new PlatformError('TOOL_UNAVAILABLE', `El agente ${input.agentKey} no está activo`);
      versionId = agent.activeVersionId;
    }
    const v = await prisma.agentVersion.findUnique({ where: { id: versionId } });
    if (!v) throw new PlatformError('NOT_FOUND', `Versión de agente ${versionId} inexistente`);
    return { id: v.id, version: v.version, def: agentDefinitionSchema.parse(v.definition) };
  }

  private async loadSkills(keys: string[], task: TaskType, pinned?: PinnedRef[]): Promise<{ key: string; version: number; def: SkillDefinition }[]> {
    const prisma = this.core.deps.prisma;
    const out: { key: string; version: number; def: SkillDefinition }[] = [];
    for (const key of [...new Set(keys)]) {
      const pin = pinned?.find((s) => s.key === key);
      let v;
      if (pin) v = await prisma.skillVersion.findUnique({ where: { id: pin.versionId } });
      else {
        const s = await prisma.skill.findUnique({ where: { key }, include: { activeVersion: true } });
        v = s?.status === 'ACTIVE' ? s.activeVersion : null;
      }
      if (!v) continue; // skills inactivas no se cargan
      const def = skillDefinitionSchema.parse(v.definition);
      // Carga selectiva: solo skills aplicables a la tarea (o sin restricción de tareas).
      if (def.appliesTo.tasks.length && !def.appliesTo.tasks.includes(task)) continue;
      out.push({ key, version: v.version, def });
    }
    return out;
  }

  private async resolveProvider(agent: AgentDefinition, executionProvider: ModelProviderConfiguration): Promise<ModelProviderConfiguration> {
    // En una ejecución simulada todos los agentes usan el proveedor simulado (coherencia del modo demo).
    if (executionProvider.kind === 'MOCK' || agent.provider === 'DEFAULT' || agent.provider === executionProvider.kind) return executionProvider;
    const alt = await this.core.deps.prisma.modelProviderConfiguration.findFirst({ where: { kind: agent.provider, enabled: true } });
    if (!alt) throw new PlatformError('TOOL_UNAVAILABLE', `No hay un proveedor ${agent.provider} habilitado para el agente`);
    return alt;
  }

  /** Registro de consumo por invocación. Un fallo al registrar no debe tumbar la tarea del agente. */
  private async recordInvocation(input: RunTaskInput, agentVersion: number, result: ModelResult, outcome: string) {
    const u = result.usage ?? {};
    const int = (n: number | undefined) => (Number.isFinite(n) ? Math.round(n as number) : 0);
    try {
      await this.core.deps.prisma.modelInvocation.create({
        data: {
          origin: input.trace?.origin ?? 'EXECUTION',
          executionId: input.trace?.executionId,
          stepKey: input.trace?.stepKey,
          attempt: input.trace?.attempt,
          agentKey: input.agentKey,
          agentVersion,
          task: input.task,
          provider: result.provider,
          model: result.model,
          simulated: result.simulated,
          outcome,
          inputTokens: int(u.inputTokens),
          outputTokens: int(u.outputTokens),
          cacheCreationInputTokens: int(u.cacheCreationInputTokens),
          cacheReadInputTokens: int(u.cacheReadInputTokens),
          costUsd: typeof u.costUsd === 'number' ? u.costUsd : null,
          durationMs: int(result.durationMs),
        },
      });
    } catch (err) {
      console.warn(`[uso] No se pudo registrar el consumo de ${input.agentKey}/${input.task}: ${(err as Error).message}`);
    }
  }

  async run(input: RunTaskInput): Promise<RunTaskResult> {
    const agent = await this.loadAgent(input);
    if (agent.def.tasks.length && !agent.def.tasks.includes(input.task)) {
      throw new PlatformError('VALIDATION_ERROR', `El agente ${input.agentKey} no declara la tarea ${input.task}`);
    }
    const skills = await this.loadSkills([...agent.def.skills, ...(input.extraSkillKeys ?? [])], input.task, input.pinned?.skills);
    const providerCfg = await this.resolveProvider(agent.def, input.executionProvider);
    const provider = createProvider(providerCfg, this.core.deps);
    const result = await provider.invoke({
      agentKey: input.agentKey,
      task: input.task,
      systemPrompt: buildSystemPrompt(agent.def, skills),
      userPrompt: buildUserPrompt(input.task, input.context),
      outputJsonSchema: taskOutputJsonSchema(input.task),
      model: agent.def.model,
      effort: agent.def.parameters.effort,
      maxOutputTokens: agent.def.parameters.maxOutputTokens,
      timeoutMs: agent.def.limits.timeoutMs,
      maxBudgetUsd: agent.def.limits.maxBudgetUsd,
      signal: input.signal,
      correlationId: input.correlationId,
      context: input.context,
    });
    // Los objetos de forma libre llegan como texto JSON desde las salidas estructuradas (ver toStructuredSchema).
    const parsed = TASK_CONTRACTS[input.task].output.safeParse(reviveStructuredOutput(taskOutputJsonSchema(input.task), result.output));
    // Se registra antes de validar: una respuesta fuera de contrato igual consumió tokens.
    await this.recordInvocation(input, agent.version, result, parsed.success ? 'OK' : 'INVALID_RESPONSE');
    if (!parsed.success) {
      throw new PlatformError('INVALID_RESPONSE', `La salida de ${input.agentKey} no cumple el contrato de ${input.task}`, {
        issues: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join('.')}: ${i.message}`),
      });
    }
    return {
      output: parsed.data,
      meta: {
        agentKey: input.agentKey,
        agentVersionId: agent.id,
        agentVersion: agent.version,
        skills: skills.map((s) => ({ key: s.key, version: s.version })),
        provider: result.provider,
        model: result.model,
        simulated: result.simulated,
        durationMs: result.durationMs,
        usage: result.usage,
        sessionId: result.sessionId,
      },
    };
  }
}
