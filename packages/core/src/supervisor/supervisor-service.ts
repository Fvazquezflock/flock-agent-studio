import { orchestratorDefinitionSchema, supervisorPlanOutput, type ExecutionSource, type SupervisorPlan } from '@mao/shared';
import type { Core } from '../core';
import type { Actor } from '../context';
import { PlatformError } from '../util/errors';

/**
 * MainSupervisor como servicio: interpreta pedidos en lenguaje natural, descubre capacidades por metadatos
 * (sin cargar prompts completos) y propone un plan. La creación de la ejecución pasa por el motor.
 */
export class SupervisorService {
  constructor(private readonly core: Core) {}

  /** Catálogo liviano: solo metadatos de orquestadores, agentes y skills activos. */
  async catalogMetadata() {
    const prisma = this.core.deps.prisma;
    const [orchestrators, agents, skills] = await Promise.all([
      prisma.orchestrator.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
      prisma.agent.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
      prisma.skill.findMany({ where: { status: 'ACTIVE' }, include: { activeVersion: true } }),
    ]);
    return {
      orchestrators: orchestrators
        .filter((o) => o.activeVersion)
        .map((o) => {
          const d = orchestratorDefinitionSchema.parse(o.activeVersion!.definition);
          return { key: o.key, name: d.name, objective: d.objective, description: d.description, useConditions: d.useConditions, keywords: d.keywords, inputFields: d.inputSchema.fields.map((f) => ({ key: f.key, type: f.type, required: f.required, label: f.label })) };
        }),
      agents: agents.map((a) => ({ key: a.key, name: a.name, description: a.description, tasks: (a.activeVersion?.definition as { tasks?: string[] })?.tasks ?? [] })),
      skills: skills.map((s) => ({ key: s.key, name: s.name, description: s.description })),
    };
  }

  async plan(text: string, opts: { projectKey?: string; providerKey?: string } = {}): Promise<SupervisorPlan & { catalogVersion: string }> {
    const prisma = this.core.deps.prisma;
    const provider = opts.providerKey
      ? await prisma.modelProviderConfiguration.findUnique({ where: { key: opts.providerKey } })
      : await prisma.modelProviderConfiguration.findFirst({ where: { isDefault: true, enabled: true } });
    if (!provider) throw new PlatformError('TOOL_UNAVAILABLE', 'No hay proveedor de IA disponible para planificar');
    const catalog = await this.catalogMetadata();
    const projects = await prisma.project.findMany({ where: { status: 'ACTIVE' }, select: { key: true, name: true, jiraProjectKey: true, mode: true } });
    const r = await this.core.agents.run({
      agentKey: 'MainSupervisor',
      task: 'plan_request',
      context: { text, catalog: { orchestrators: catalog.orchestrators }, projects, projectKey: opts.projectKey },
      executionProvider: provider,
      correlationId: `plan:${Date.now()}`,
      trace: { origin: 'SUPERVISOR_PLAN' },
    });
    const plan = supervisorPlanOutput.parse(r.output);
    // El plan del modelo se valida contra el catálogo real: nunca se ejecuta algo inexistente.
    if (plan.orchestratorKey && !catalog.orchestrators.some((o) => o.key === plan.orchestratorKey)) {
      plan.missingCapability = `El orquestador sugerido (${plan.orchestratorKey}) no existe o no está activo`;
      plan.orchestratorKey = null;
    }
    if (plan.projectKey && !projects.some((p) => p.key === plan.projectKey)) plan.projectKey = null;
    const orch = catalog.orchestrators.find((o) => o.key === plan.orchestratorKey);
    plan.steps = orch ? [`Ejecutar ${orch.key}: ${orch.objective}`] : [];
    return { ...plan, catalogVersion: `${catalog.orchestrators.length}o/${catalog.agents.length}a/${catalog.skills.length}s`, ...(r.meta.simulated ? { rationale: `${plan.rationale} (planificación simulada)` } : {}) };
  }

  async run(text: string, opts: { projectKey?: string; providerKey?: string; source: ExecutionSource }, actor: Actor) {
    const plan = await this.plan(text, opts);
    if (!plan.orchestratorKey) return { plan, execution: null, reason: plan.missingCapability ?? 'Sin orquestador aplicable' };
    if (!plan.projectKey) return { plan, execution: null, reason: 'No se pudo identificar el proyecto: indicá --project' };
    const execution = await this.core.engine.createExecution(
      { projectKey: plan.projectKey, orchestratorKey: plan.orchestratorKey, input: plan.input, source: opts.source, providerKey: opts.providerKey, requestText: text },
      actor,
      { plan },
    );
    return { plan, execution, reason: null };
  }
}
