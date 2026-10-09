import { hostname } from 'node:os';
import {
  TERMINAL_EXECUTION_STATUSES,
  orchestratorDefinitionSchema,
  type CreateExecutionRequest,
  type ExecutionStatus,
  type OrchestratorDefinition,
  type OrchestratorStepDefinition,
  type TaskType,
} from '@mao/shared';
import { Prisma, type ExecutionStep } from '@mao/db';
import type { Core } from '../core';
import type { Actor } from '../context';
import { SYSTEM_ACTOR } from '../context';
import { topologicalLayers, validateOrchestratorDefinition } from '../catalog/validation';
import type { IJiraGateway } from '../jira/types';
import type { ModelUsage } from '../providers/types';
import { backoffDelay, invalid, isRetryable, notFound, PlatformError, toPlatformError } from '../util/errors';
import { getPath } from '../util/merge';
import { emitEvent, type EventLevel } from './events';
import { HANDLERS } from './handlers';
import type { LoadedExecution, PinnedSnapshot, StepContext, StepOutcome } from './step-context';

const LEASE_MS = 60_000;
const HEARTBEAT_MS = 10_000;
const ISSUE_KEY = /^[A-Z][A-Z0-9_]+-\d+$/;

export class ExecutionEngine {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  // =====================================================================
  // Creación
  // =====================================================================

  async createExecution(req: CreateExecutionRequest, actor: Actor, opts: { plan?: unknown } = {}) {
    const prisma = this.prisma;
    const project = await prisma.project.findUnique({ where: { key: req.projectKey }, include: { defaultProvider: true } });
    if (!project) throw notFound(`Proyecto ${req.projectKey}`);
    if (project.status !== 'ACTIVE') throw new PlatformError('VALIDATION_ERROR', `El proyecto ${project.key} no está activo`);

    const orchestrator = await prisma.orchestrator.findUnique({ where: { key: req.orchestratorKey }, include: { activeVersion: true } });
    if (!orchestrator) throw notFound(`Orquestador ${req.orchestratorKey}`);
    if (orchestrator.status !== 'ACTIVE' || !orchestrator.activeVersion) throw new PlatformError('VALIDATION_ERROR', `El orquestador ${orchestrator.key} no tiene una versión activa`);

    const { config, configRow, globalVersion } = await this.core.config.resolvedForProject(project.id);
    if (config.enabledOrchestrators.length && !config.enabledOrchestrators.includes(orchestrator.key)) {
      throw new PlatformError('AUTHORIZATION_ERROR', `El orquestador ${orchestrator.key} no está habilitado para ${project.key}`);
    }
    const index = await this.core.catalog.index();
    const validation = validateOrchestratorDefinition(orchestrator.activeVersion.definition, index);
    if (!validation.valid) throw invalid(`La definición activa de ${orchestrator.key} no es válida: ${validation.errors.join('; ')}`);
    const def = validation.value!;
    if (config.enabledAgents.length) {
      const blocked = def.steps.filter((s) => s.agentKey && !config.enabledAgents.includes(s.agentKey)).map((s) => s.agentKey);
      if (blocked.length) throw new PlatformError('AUTHORIZATION_ERROR', `Agentes no habilitados en ${project.key}: ${[...new Set(blocked)].join(', ')}`);
    }

    // Entrada según el esquema declarado del orquestador.
    const input: Record<string, string> = {};
    for (const f of def.inputSchema.fields) {
      const v = (req.input[f.key] ?? '').trim();
      if (f.required && !v) throw invalid(`Falta el dato obligatorio "${f.label}" (${f.key})`);
      if (!v) continue;
      if (f.type === 'issueKey') {
        const key = v.toUpperCase();
        if (!ISSUE_KEY.test(key)) throw invalid(`"${v}" no es una clave de issue válida`);
        if (key.split('-')[0] !== project.jiraProjectKey) throw invalid(`${key} no pertenece al proyecto Jira ${project.jiraProjectKey}`);
        input[f.key] = key;
      } else input[f.key] = v;
    }

    const provider = req.providerKey
      ? await prisma.modelProviderConfiguration.findUnique({ where: { key: req.providerKey } })
      : (project.defaultProvider ?? (await prisma.modelProviderConfiguration.findFirst({ where: { isDefault: true, enabled: true } })));
    if (!provider) throw new PlatformError('TOOL_UNAVAILABLE', 'No hay un proveedor de IA configurado');
    if (!provider.enabled) throw new PlatformError('TOOL_UNAVAILABLE', `El proveedor ${provider.key} está deshabilitado`);

    const pinned = await this.core.catalog.activeDefinitions();
    const policies = await prisma.approvalPolicy.findMany({ where: { status: 'ACTIVE' } });
    const snapshot: PinnedSnapshot = {
      orchestrator: { key: orchestrator.key, versionId: orchestrator.activeVersion.id, version: orchestrator.activeVersion.version, checksum: orchestrator.activeVersion.checksum },
      projectConfig: { id: configRow.id, version: configRow.version, checksum: configRow.checksum },
      globalConfigVersion: globalVersion,
      agents: pinned.agents,
      skills: pinned.skills,
      policies: policies.map((p) => ({ id: p.id, operationType: p.operationType, scope: p.scope, mode: p.mode, version: p.version })),
      provider: { key: provider.key, kind: provider.kind },
      config,
    };
    const missingAgents = def.steps.filter((s) => s.agentKey && !pinned.agents.some((a) => a.key === s.agentKey)).map((s) => s.agentKey);
    if (missingAgents.length) throw new PlatformError('TOOL_UNAVAILABLE', `Agentes sin versión activa: ${[...new Set(missingAgents)].join(', ')}`);

    const layers = validation.layers ?? [def.steps.map((s) => s.key)];
    const position = new Map(layers.flatMap((l, i) => l.map((k) => [k, i] as const)));
    const simulation = { model: provider.kind === 'MOCK' ? 'SIMULATED' : 'REAL', jira: project.mode === 'DEMO' ? 'DEMO' : 'LIVE' };

    const execution = await prisma.$transaction(async (tx) => {
      const ex = await tx.execution.create({
        data: {
          source: req.source,
          projectId: project.id,
          orchestratorVersionId: orchestrator.activeVersion!.id,
          projectConfigurationId: configRow.id,
          providerId: provider.id,
          input,
          snapshot: snapshot as object,
          simulation,
          requestedBy: actor.id,
          requestText: req.requestText,
          plan: (opts.plan ?? undefined) as object | undefined,
          steps: {
            create: def.steps.map((s, i) => ({
              key: s.key,
              name: s.name,
              handler: s.handler,
              agentKey: s.agentKey,
              agentVersionId: pinned.agents.find((a) => a.key === s.agentKey)?.versionId,
              position: (position.get(s.key) ?? 0) * 100 + i,
              dependsOn: [...new Set([...s.dependsOn, ...s.inputs])],
              maxAttempts: s.retry.maxAttempts ?? def.errorHandling.defaultMaxAttempts,
            })),
          },
        },
      });
      await emitEvent(tx, ex.id, 'EXECUTION_CREATED', `Ejecución EX-${ex.number} creada desde ${req.source} (${orchestrator.key} v${orchestrator.activeVersion!.version})`, {
        data: { simulation, provider: provider.key, input },
        level: simulation.model === 'SIMULATED' || simulation.jira === 'DEMO' ? 'warn' : 'info',
      });
      if (simulation.model === 'SIMULATED') await emitEvent(tx, ex.id, 'SIMULATION_NOTICE', 'Modelo SIMULADO: los resultados son heurísticas determinísticas, no salidas de un modelo de IA.', { level: 'warn' });
      if (simulation.jira === 'DEMO') await emitEvent(tx, ex.id, 'SIMULATION_NOTICE', 'Proyecto DEMO: se leen datos ficticios y la publicación es simulada.', { level: 'warn' });
      await this.core.audit.record(
        { actor, action: 'EXECUTION_CREATED', entityType: 'Execution', entityId: ex.id, projectId: project.id, executionId: ex.id, summary: `EX-${ex.number} ${orchestrator.key} en ${project.key} (origen ${req.source})`, data: { input, provider: provider.key, simulation } },
        tx,
      );
      return ex;
    });
    return execution;
  }

  // =====================================================================
  // Consulta
  // =====================================================================

  async get(idOrNumber: string) {
    const where = /^\d+$/.test(idOrNumber) ? { number: Number(idOrNumber) } : /^EX-\d+$/i.test(idOrNumber) ? { number: Number(idOrNumber.slice(3)) } : { id: idOrNumber };
    const ex = await this.prisma.execution.findFirst({
      where,
      include: {
        steps: { orderBy: { position: 'asc' } },
        project: { select: { key: true, name: true, mode: true, jiraProjectKey: true } },
        orchestratorVersion: { select: { version: true, orchestrator: { select: { key: true, name: true } } } },
        provider: { select: { key: true, name: true, kind: true } },
        approvalRequests: { select: { id: true, number: true, status: true, title: true, kind: true }, orderBy: { createdAt: 'asc' } },
        operations: { orderBy: { createdAt: 'asc' } },
        proposals: { select: { id: true, number: true, title: true, status: true, kind: true, targetKey: true } },
      },
    });
    if (!ex) throw notFound(`Ejecución ${idOrNumber}`);
    return ex;
  }

  async list(filters: { status?: string; projectKey?: string; source?: string; orchestratorKey?: string; limit?: number } = {}) {
    const where: Prisma.ExecutionWhereInput = {};
    if (filters.status === 'ACTIVE') where.status = { in: ['PENDING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING'] };
    else if (filters.status) where.status = filters.status as ExecutionStatus;
    if (filters.projectKey) where.project = { key: filters.projectKey };
    if (filters.source) where.source = filters.source as Prisma.EnumExecutionSourceFilter['equals'];
    if (filters.orchestratorKey) where.orchestratorVersion = { orchestrator: { key: filters.orchestratorKey } };
    return this.prisma.execution.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(filters.limit ?? 50, 200),
      select: {
        id: true,
        number: true,
        source: true,
        status: true,
        currentStepKey: true,
        input: true,
        simulation: true,
        requestedBy: true,
        createdAt: true,
        startedAt: true,
        finishedAt: true,
        error: true,
        project: { select: { key: true, name: true } },
        orchestratorVersion: { select: { version: true, orchestrator: { select: { key: true, name: true } } } },
        steps: { select: { key: true, status: true, agentKey: true }, orderBy: { position: 'asc' } },
      },
    });
  }

  async events(executionId: string | null, afterId: bigint, limit = 500) {
    return this.prisma.executionEvent.findMany({
      where: { ...(executionId ? { executionId } : {}), id: { gt: afterId } },
      orderBy: { id: 'asc' },
      take: limit,
    });
  }

  // =====================================================================
  // Acciones
  // =====================================================================

  async cancel(idOrNumber: string, actor: Actor) {
    const ex = await this.get(idOrNumber);
    if ((TERMINAL_EXECUTION_STATUSES as string[]).includes(ex.status)) throw new PlatformError('VERSION_CONFLICT', `La ejecución ya está ${ex.status}`);
    await this.prisma.execution.update({ where: { id: ex.id }, data: { cancelRequestedAt: new Date() } });
    await this.core.audit.record({ actor, action: 'EXECUTION_CANCEL_REQUESTED', entityType: 'Execution', entityId: ex.id, executionId: ex.id, projectId: ex.projectId, summary: `Cancelación solicitada para EX-${ex.number}` });
    // Si nadie la está procesando, se cancela de inmediato; si no, el worker la detiene.
    const free = ex.status !== 'RUNNING' || !ex.lockedUntil || ex.lockedUntil < new Date();
    if (free) await this.finalizeCancel(ex.id, actor);
    return this.get(ex.id);
  }

  private async finalizeCancel(id: string, actor: Actor) {
    await this.prisma.$transaction(async (tx) => {
      await tx.executionStep.updateMany({ where: { executionId: id, status: { in: ['PENDING', 'RUNNING', 'RETRYING', 'WAITING_APPROVAL'] } }, data: { status: 'CANCELLED', finishedAt: new Date() } });
      await tx.approvalRequest.updateMany({ where: { executionId: id, status: { in: ['PENDING', 'PARTIALLY_DECIDED'] } }, data: { status: 'CANCELLED' } });
      await tx.execution.update({ where: { id }, data: { status: 'CANCELLED', finishedAt: new Date(), lockedBy: null, lockedUntil: null, error: { code: 'CANCELLED', message: `Cancelada por ${actor.id}` } } });
      await emitEvent(tx, id, 'EXECUTION_CANCELLED', `Ejecución cancelada por ${actor.id}`, { level: 'warn' });
    });
  }

  /** Reintento manual de una ejecución fallida: retoma desde las etapas fallidas. */
  async retry(idOrNumber: string, actor: Actor) {
    const ex = await this.get(idOrNumber);
    if (ex.status !== 'FAILED') throw new PlatformError('VERSION_CONFLICT', 'Solo se reintentan ejecuciones fallidas');
    await this.prisma.$transaction(async (tx) => {
      await tx.executionStep.updateMany({ where: { executionId: ex.id, status: { in: ['FAILED', 'CANCELLED'] } }, data: { status: 'PENDING', attempt: 0, error: Prisma.DbNull, nextRunAt: null } });
      await tx.execution.update({ where: { id: ex.id }, data: { status: 'PENDING', error: Prisma.DbNull, finishedAt: null, nextRunAt: null, cancelRequestedAt: null } });
      await emitEvent(tx, ex.id, 'EXECUTION_RETRY', `Reintento manual solicitado por ${actor.id}`);
      await this.core.audit.record({ actor, action: 'EXECUTION_RETRIED', entityType: 'Execution', entityId: ex.id, executionId: ex.id, projectId: ex.projectId, summary: `Reintento manual de EX-${ex.number}` }, tx);
    });
    return this.get(ex.id);
  }

  /** "Rechazar y regenerar": vuelve a PENDING las etapas de generación (y sus dependientes) con la observación. */
  async resetForRegeneration(executionId: string, gateStepKey: string, feedback: string, actor: Actor) {
    const ex = await this.get(executionId);
    const def = orchestratorDefinitionSchema.parse((await this.prisma.orchestratorVersion.findUniqueOrThrow({ where: { id: ex.orchestratorVersionId } })).definition);
    const gate = def.steps.find((s) => s.key === gateStepKey);
    const from = (gate?.params.regenerateFrom as string[] | undefined) ?? [];
    if (!from.length) throw new PlatformError('VALIDATION_ERROR', 'Este flujo no define etapas regenerables');
    const reset = new Set(from);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of def.steps) {
        if (!reset.has(s.key) && [...s.dependsOn, ...s.inputs].some((d) => reset.has(d))) {
          reset.add(s.key);
          grew = true;
        }
      }
    }
    await this.prisma.$transaction(async (tx) => {
      for (const key of reset) {
        await tx.executionStep.update({
          where: { executionId_key: { executionId, key } },
          data: { status: 'PENDING', attempt: 0, output: Prisma.DbNull, error: Prisma.DbNull, input: from.includes(key) ? { feedback } : Prisma.DbNull, startedAt: null, finishedAt: null, nextRunAt: null },
        });
      }
      await tx.execution.update({ where: { id: executionId }, data: { status: 'PENDING', nextRunAt: null } });
      await emitEvent(tx, executionId, 'REGENERATION_REQUESTED', `Regenerando ${[...reset].join(', ')} con la observación: "${feedback}"`, { level: 'warn' });
    });
    await this.core.audit.record({ actor, action: 'EXECUTION_REGENERATE', entityType: 'Execution', entityId: executionId, executionId, projectId: ex.projectId, summary: `Regeneración de EX-${ex.number} desde ${from.join(', ')}` });
  }

  // =====================================================================
  // Worker
  // =====================================================================

  /** Toma ejecuciones disponibles (pendientes, reintento vencido o lease expirado tras un reinicio). */
  async claim(workerId: string, limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    // Prisma guarda DateTime como timestamp UTC sin zona: se compara siempre contra now() en UTC,
    // independientemente de la zona horaria configurada en el servidor PostgreSQL.
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Execution" e
      SET "status" = 'RUNNING', "lockedBy" = ${workerId}, "lockedUntil" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${LEASE_MS / 1000}),
          "startedAt" = COALESCE(e."startedAt", (now() AT TIME ZONE 'UTC')), "attempt" = e."attempt" + 1, "updatedAt" = (now() AT TIME ZONE 'UTC')
      WHERE e.id IN (
        SELECT id FROM "Execution"
        WHERE ("status" = 'PENDING' AND ("nextRunAt" IS NULL OR "nextRunAt" <= (now() AT TIME ZONE 'UTC')))
           OR ("status" = 'RETRYING' AND "nextRunAt" <= (now() AT TIME ZONE 'UTC'))
           OR ("status" = 'RUNNING' AND ("lockedUntil" IS NULL OR "lockedUntil" < (now() AT TIME ZONE 'UTC')))
        ORDER BY "createdAt" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING e.id`;
    return rows.map((r) => r.id);
  }

  private async load(id: string): Promise<LoadedExecution> {
    const ex = await this.prisma.execution.findUnique({
      where: { id },
      include: { project: { include: { connection: true } }, provider: true, steps: { orderBy: { position: 'asc' } } },
    });
    if (!ex) throw notFound(`Ejecución ${id}`);
    return ex;
  }

  /** Procesa una ejecución tomada hasta que termina o queda bloqueada (aprobación / reintento programado). */
  async runExecution(id: string, workerId: string): Promise<void> {
    const abort = new AbortController();
    const heartbeat = setInterval(async () => {
      try {
        const r = await this.prisma.execution.updateMany({ where: { id, lockedBy: workerId }, data: { lockedUntil: new Date(Date.now() + LEASE_MS) } });
        const ex = await this.prisma.execution.findUnique({ where: { id }, select: { cancelRequestedAt: true } });
        if (r.count === 0 || ex?.cancelRequestedAt) abort.abort();
      } catch {
        /* el próximo latido reintenta */
      }
    }, HEARTBEAT_MS);
    let gateway: IJiraGateway | undefined;
    const rechecked = new Set<string>();
    try {
      let ex = await this.load(id);
      const definition = orchestratorDefinitionSchema.parse((await this.prisma.orchestratorVersion.findUniqueOrThrow({ where: { id: ex.orchestratorVersionId } })).definition);
      const snapshot = ex.snapshot as unknown as PinnedSnapshot;
      if (!ex.startedAt || ex.attempt === 1) await emitEvent(this.prisma, id, 'EXECUTION_STARTED', `Worker ${workerId} procesando EX-${ex.number}`);
      await this.recoverInterruptedSteps(ex);

      for (let guard = 0; guard < 200; guard++) {
        ex = await this.load(id);
        if (ex.cancelRequestedAt || abort.signal.aborted) {
          await this.finalizeCancel(id, SYSTEM_ACTOR);
          return;
        }
        const byKey = new Map(ex.steps.map((s) => [s.key, s]));
        const defByKey = new Map(definition.steps.map((s) => [s.key, s]));
        const isDone = (k: string) => {
          const s = byKey.get(k);
          return !!s && (s.status === 'COMPLETED' || s.status === 'SKIPPED' || (s.status === 'FAILED' && defByKey.get(k)?.onError === 'continue'));
        };
        const now = Date.now();
        const ready = ex.steps.filter((s) => {
          const ok = s.dependsOn.every(isDone);
          if (!ok) return false;
          if (s.status === 'PENDING') return true;
          if (s.status === 'RETRYING') return !s.nextRunAt || s.nextRunAt.getTime() <= now;
          if (s.status === 'WAITING_APPROVAL' && !rechecked.has(s.key)) return true;
          return false;
        });
        if (!ready.length) {
          await this.settle(ex, definition);
          return;
        }
        if (gateway === undefined) gateway = this.core.connections.gatewayFor(ex.project);
        const outputs: Record<string, unknown> = {};
        for (const s of ex.steps) if (s.status === 'COMPLETED' || s.status === 'WAITING_APPROVAL') outputs[s.key] = s.output;

        const parallel = ready.filter((s) => defByKey.get(s.key)?.parallelSafe !== false);
        const serial = ready.filter((s) => defByKey.get(s.key)?.parallelSafe === false);
        for (const s of ready) if (s.status === 'WAITING_APPROVAL') rechecked.add(s.key);
        const ctxFor = (s: ExecutionStep) => this.stepContext(ex, s, defByKey.get(s.key)!, definition, snapshot, outputs, abort.signal, () => gateway!);
        if (parallel.length > 1) await emitEvent(this.prisma, id, 'PARALLEL_STEPS', `Etapas en paralelo: ${parallel.map((s) => s.name).join(', ')}`);
        await Promise.all(parallel.map((s) => this.runStep(ctxFor(s))));
        for (const s of serial) await this.runStep(ctxFor(s));
      }
      throw new PlatformError('INTERNAL', 'Se superó el máximo de iteraciones del motor');
    } catch (err) {
      const e = toPlatformError(err);
      await this.prisma.execution.update({ where: { id }, data: { status: 'FAILED', error: e.toJSON() as object, finishedAt: new Date(), lockedBy: null, lockedUntil: null } });
      await emitEvent(this.prisma, id, 'EXECUTION_FAILED', `Error del motor: ${e.message}`, { level: 'error', data: e.toJSON() });
    } finally {
      clearInterval(heartbeat);
      await this.prisma.execution.updateMany({ where: { id, lockedBy: workerId }, data: { lockedBy: null, lockedUntil: null } });
    }
  }

  /** Etapas que quedaron RUNNING por un worker caído: vuelven a la cola (o fallan si agotaron intentos). */
  private async recoverInterruptedSteps(ex: LoadedExecution) {
    for (const s of ex.steps.filter((x) => x.status === 'RUNNING')) {
      const exhausted = s.attempt >= s.maxAttempts;
      await this.prisma.executionStep.update({
        where: { id: s.id },
        data: exhausted
          ? { status: 'FAILED', finishedAt: new Date(), error: { code: 'INTERNAL', message: 'Interrumpida por un reinicio y sin intentos restantes' } }
          : { status: 'PENDING' },
      });
      await emitEvent(this.prisma, ex.id, 'STEP_RECOVERED', `Etapa "${s.name}" interrumpida por un reinicio: ${exhausted ? 'sin intentos restantes' : 'se vuelve a ejecutar'}`, { stepKey: s.key, level: 'warn' });
    }
  }

  /** Sin etapas listas: decide el estado de la ejecución. */
  private async settle(ex: LoadedExecution, definition: OrchestratorDefinition) {
    const steps = ex.steps;
    const failed = steps.filter((s) => s.status === 'FAILED' && definition.steps.find((d) => d.key === s.key)?.onError !== 'continue');
    const waiting = steps.filter((s) => s.status === 'WAITING_APPROVAL');
    const retrying = steps.filter((s) => s.status === 'RETRYING');
    const allDone = steps.every((s) => ['COMPLETED', 'SKIPPED'].includes(s.status) || (s.status === 'FAILED' && !failed.includes(s)));
    if (allDone) {
      const output = buildExecutionResult(definition, steps);
      await this.prisma.execution.update({ where: { id: ex.id }, data: { status: 'COMPLETED', output: output as object, finishedAt: new Date(), currentStepKey: null, lockedBy: null, lockedUntil: null } });
      await emitEvent(this.prisma, ex.id, 'EXECUTION_COMPLETED', `EX-${ex.number} completada`, { level: 'success', data: output });
      await this.core.audit.record({ actor: { type: 'WORKER', id: 'worker' }, action: 'EXECUTION_COMPLETED', entityType: 'Execution', entityId: ex.id, executionId: ex.id, projectId: ex.projectId, summary: `EX-${ex.number} completada` });
      return;
    }
    if (failed.length) {
      const err = (failed[0].error as object) ?? { code: 'INTERNAL', message: 'Etapa fallida' };
      await this.prisma.$transaction(async (tx) => {
        await tx.executionStep.updateMany({ where: { executionId: ex.id, status: { in: ['PENDING', 'WAITING_APPROVAL', 'RETRYING'] } }, data: { status: 'CANCELLED' } });
        await tx.approvalRequest.updateMany({ where: { executionId: ex.id, status: { in: ['PENDING', 'PARTIALLY_DECIDED'] } }, data: { status: 'CANCELLED' } });
        await tx.execution.update({ where: { id: ex.id }, data: { status: 'FAILED', error: { ...err, step: failed[0].key }, finishedAt: new Date(), lockedBy: null, lockedUntil: null } });
        await emitEvent(tx, ex.id, 'EXECUTION_FAILED', `EX-${ex.number} falló en "${failed[0].name}"`, { level: 'error', data: err });
      });
      await this.core.audit.record({ actor: { type: 'WORKER', id: 'worker' }, action: 'EXECUTION_FAILED', entityType: 'Execution', entityId: ex.id, executionId: ex.id, projectId: ex.projectId, summary: `EX-${ex.number} falló en ${failed[0].key}`, data: err });
      return;
    }
    if (retrying.length) {
      const next = retrying.map((s) => s.nextRunAt?.getTime() ?? Date.now()).reduce((a, b) => Math.min(a, b));
      await this.prisma.execution.update({ where: { id: ex.id }, data: { status: 'RETRYING', nextRunAt: new Date(next), lockedBy: null, lockedUntil: null } });
      return;
    }
    if (waiting.length) {
      await this.prisma.execution.update({ where: { id: ex.id }, data: { status: 'WAITING_APPROVAL', currentStepKey: waiting[0].key, lockedBy: null, lockedUntil: null } });
      await emitEvent(this.prisma, ex.id, 'EXECUTION_WAITING_APPROVAL', `EX-${ex.number} espera aprobación en "${waiting[0].name}"`, { stepKey: waiting[0].key, level: 'warn' });
      return;
    }
    throw new PlatformError('INTERNAL', 'Estado inconsistente: hay etapas bloqueadas sin dependencias resueltas');
  }

  private stepContext(
    ex: LoadedExecution,
    step: ExecutionStep,
    def: OrchestratorStepDefinition,
    definition: OrchestratorDefinition,
    snapshot: PinnedSnapshot,
    outputs: Record<string, unknown>,
    signal: AbortSignal,
    gateway: () => IJiraGateway,
  ): StepContext {
    const core = this.core;
    const prisma = this.prisma;
    const decisions: unknown[] = [];
    const ctx: StepContext = {
      core,
      execution: ex,
      step,
      def,
      definition,
      snapshot,
      config: snapshot.config,
      input: ex.input as Record<string, string>,
      outputs,
      signal,
      gateway,
      emit: (type, message, opts = {}) => emitEvent(prisma, ex.id, type, message, { stepKey: step.key, ...opts }),
      runAgent: async (agentKey: string, task: TaskType, context: Record<string, unknown>) => {
        await ctx.emit('AGENT_INVOKED', `${agentKey} → ${task}`, { data: { agentKey, task } });
        const r = await core.agents.run({
          agentKey,
          task,
          context,
          pinned: { agents: snapshot.agents, skills: snapshot.skills },
          extraSkillKeys: [...def.skillKeys, ...snapshot.config.projectSkills],
          executionProvider: ex.provider,
          correlationId: `${ex.id}:${step.key}:${step.attempt + 1}`,
          signal,
          trace: { origin: 'EXECUTION', executionId: ex.id, stepKey: step.key, attempt: step.attempt + 1 },
        });
        decisions.push({ task, ...r.meta });
        (ctx as StepContext & { _decisions: unknown[] })._decisions = decisions;
        await ctx.emit('AGENT_RESULT', `${agentKey} respondió (${r.meta.simulated ? 'simulado' : r.meta.model}, ${r.meta.durationMs} ms)`, {
          level: r.meta.simulated ? 'warn' : 'info',
          data: { agentKey, task, agentVersion: r.meta.agentVersion, skills: r.meta.skills, provider: r.meta.provider, simulated: r.meta.simulated, usage: r.meta.usage },
        });
        return r.output;
      },
      findOutput: (match) => {
        for (const s of definition.steps) {
          if (match.key && s.key !== match.key) continue;
          if (match.task && s.task !== match.task) continue;
          if (match.handler && s.handler !== match.handler) continue;
          if (outputs[s.key] !== undefined && outputs[s.key] !== null) return outputs[s.key] as never;
        }
        return undefined;
      },
      findOutputs: (match) =>
        definition.steps
          .filter((s) => (!match.task || s.task === match.task) && (!match.handler || s.handler === match.handler) && outputs[s.key] != null)
          .map((s) => ({ key: s.key, output: outputs[s.key] as never })),
    };
    return ctx;
  }

  private async runStep(ctx: StepContext) {
    const { step, def, execution } = ctx;
    const prisma = this.prisma;
    // Condición de ejecución declarativa.
    if (def.runIf) {
      const v = getPath(ctx.outputs[def.runIf.step], def.runIf.path);
      const pass =
        def.runIf.op === 'exists' ? v !== undefined && v !== null : def.runIf.op === 'notEmpty' ? (Array.isArray(v) ? v.length > 0 : !!v) : def.runIf.op === 'equals' ? v === def.runIf.value : v !== def.runIf.value;
      if (!pass) {
        await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'SKIPPED', finishedAt: new Date() } });
        await ctx.emit('STEP_SKIPPED', `"${step.name}" omitida: no se cumple la condición`);
        return;
      }
    }
    const resuming = step.status === 'WAITING_APPROVAL';
    const attempt = resuming ? step.attempt : step.attempt + 1;
    await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'RUNNING', attempt, startedAt: step.startedAt ?? new Date(), nextRunAt: null } });
    await prisma.execution.update({ where: { id: execution.id }, data: { currentStepKey: step.key } });
    if (!resuming) await ctx.emit('STEP_STARTED', `Inicia "${step.name}"${step.agentKey ? ` (${step.agentKey})` : ''}${attempt > 1 ? ` — intento ${attempt}/${step.maxAttempts}` : ''}`);
    const started = Date.now();
    try {
      const handler = HANDLERS[def.handler];
      const outcome: StepOutcome = await handler.run({ ...ctx, step: { ...step, attempt } });
      const decisions = (ctx as StepContext & { _decisions?: unknown[] })._decisions;
      // Resumen del intento que completó la etapa; el consumo total (con reintentos) está en ModelInvocation.
      const usage = decisions?.reduce<Required<ModelUsage>>(
        (acc, d) => {
          const u = (d as { usage?: ModelUsage }).usage;
          return {
            inputTokens: acc.inputTokens + (u?.inputTokens ?? 0),
            outputTokens: acc.outputTokens + (u?.outputTokens ?? 0),
            cacheCreationInputTokens: acc.cacheCreationInputTokens + (u?.cacheCreationInputTokens ?? 0),
            cacheReadInputTokens: acc.cacheReadInputTokens + (u?.cacheReadInputTokens ?? 0),
            costUsd: acc.costUsd + (u?.costUsd ?? 0),
          };
        },
        { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, costUsd: 0 },
      );
      if (outcome.status === 'WAITING_APPROVAL') {
        await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'WAITING_APPROVAL', output: (outcome.output ?? undefined) as object | undefined } });
        if (!resuming) await ctx.emit('STEP_WAITING_APPROVAL', outcome.summary ?? `"${step.name}" espera aprobación`, { level: 'warn', data: outcome.output });
        return;
      }
      await prisma.executionStep.update({
        where: { id: step.id },
        data: {
          status: outcome.status,
          output: (outcome.output ?? undefined) as object | undefined,
          decisions: decisions ? (decisions as object) : undefined,
          usage: usage ? (usage as object) : undefined,
          finishedAt: new Date(),
          error: Prisma.DbNull,
        },
      });
      await ctx.emit(outcome.status === 'SKIPPED' ? 'STEP_SKIPPED' : 'STEP_COMPLETED', `${outcome.status === 'SKIPPED' ? 'Omitida' : 'Completada'} "${step.name}"${outcome.summary ? `: ${outcome.summary}` : ''} (${Date.now() - started} ms)`, {
        level: outcome.status === 'SKIPPED' ? 'info' : 'success',
      });
    } catch (err) {
      const e = toPlatformError(err);
      if (e.code === 'CANCELLED' && ctx.signal.aborted) {
        await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'CANCELLED', finishedAt: new Date(), error: e.toJSON() as object } });
        await ctx.emit('STEP_CANCELLED', `"${step.name}" cancelada`, { level: 'warn' });
        return;
      }
      const canRetry = isRetryable(e.code) && attempt < step.maxAttempts;
      if (canRetry) {
        const delay = backoffDelay(attempt, def.retry.backoffMs);
        await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'RETRYING', error: e.toJSON() as object, nextRunAt: new Date(Date.now() + delay) } });
        await ctx.emit('STEP_RETRY_SCHEDULED', `"${step.name}" falló (${e.code}): reintento ${attempt + 1}/${step.maxAttempts} en ${Math.round(delay / 1000)} s`, { level: 'warn', data: e.toJSON() });
      } else {
        await prisma.executionStep.update({ where: { id: step.id }, data: { status: 'FAILED', error: e.toJSON() as object, finishedAt: new Date() } });
        await ctx.emit('STEP_FAILED', `"${step.name}" falló: ${e.code} — ${e.message}`, { level: 'error', data: e.toJSON() });
      }
    }
  }

  /** Procesa todo lo disponible en el proceso actual (pruebas e integración CLI). */
  async runUntilIdle(workerId = `inline-${hostname()}-${process.pid}`, maxRounds = 50): Promise<number> {
    let processed = 0;
    for (let i = 0; i < maxRounds; i++) {
      const ids = await this.claim(workerId, 4);
      if (!ids.length) break;
      for (const id of ids) {
        await this.runExecution(id, workerId);
        processed++;
      }
    }
    return processed;
  }
}


/** Resultado consolidado de la ejecución (para CLI, UI y API). */
export function buildExecutionResult(definition: OrchestratorDefinition, steps: ExecutionStep[]) {
  const out = (pred: (d: OrchestratorStepDefinition) => boolean) => {
    const d = definition.steps.find(pred);
    return d ? (steps.find((s) => s.key === d.key)?.output as any) : undefined;
  };
  const publish = out((d) => d.handler === 'jira.publish');
  const review = out((d) => d.handler === 'supervisor.review');
  const stories = out((d) => d.task === 'generate_stories');
  const validation = out((d) => d.task === 'validate_plan');
  const storyReview = out((d) => d.task === 'story_review');
  const improvements = out((d) => d.task === 'story_improvements');
  const tasks = definition.steps.filter((d) => d.task === 'technical_breakdown').flatMap((d) => (steps.find((s) => s.key === d.key)?.output as any)?.tasks ?? []);
  return {
    stories: stories?.stories?.length ?? undefined,
    tasks: tasks.length,
    validation: validation ? { verdict: validation.verdict, issues: validation.issues?.length ?? 0 } : undefined,
    diagnosis: storyReview?.diagnosis,
    improvements: improvements?.changes?.length,
    quality: review?.qualityScore,
    proposals: review?.proposals ?? [],
    publication: publish
      ? { mode: publish.mode, succeeded: publish.succeeded, simulated: publish.simulated, skipped: publish.skipped, failed: publish.failed, blocked: publish.blocked, results: publish.results }
      : undefined,
    hasErrors: !!publish && (publish.failed > 0 || publish.blocked > 0),
  };
}
