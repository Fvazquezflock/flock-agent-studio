import { agentDefinitionSchema, skillDefinitionSchema, type TaskType } from '@mao/shared';
import type { Core } from '../core';
import { buildSystemPrompt, buildUserPrompt } from '../agents/prompts';
import { DemoJiraGateway } from '../jira/demo-gateway';
import { PlatformError, notFound, toPlatformError } from '../util/errors';
import type { CatalogKind } from './validation';

/** Contexto de ejemplo construido con los datos demo (nunca con Jira real). */
async function sampleContext(task: TaskType, config: unknown): Promise<Record<string, unknown>> {
  const gw = new DemoJiraGateway();
  const epic = await gw.getIssue('DEMO-100');
  const children = await gw.getChildren('DEMO-100');
  const story = await gw.getIssue('DEMO-102');
  switch (task) {
    case 'summarize_context':
      return { mode: 'epic', root: epic, children, related: [] };
    case 'functional_analysis':
    case 'generate_stories':
      return { epic, existingStories: children.filter((c) => c.issueType === 'Story'), config };
    case 'story_review':
    case 'story_improvements':
      return { story, parent: epic, subtasks: story.subtasks, config, review: { problems: [] } };
    case 'technical_breakdown':
      return { specialty: 'BACKEND', stories: [{ ref: 'S1', title: 'Cancelar un turno hasta 2 horas antes', acceptanceCriteria: ['Dado…, cuando…, entonces…'] }], existingTasks: [], config };
    case 'plan_request':
      return { text: 'Analizá la épica DEMO-100 y proponé historias', catalog: { orchestrators: [] }, projects: [] };
    default:
      return { config };
  }
}

/** "Probar" una versión (incluidos borradores) sin activarla: compone el prompt e invoca el proveedor elegido. */
export class CatalogTestService {
  constructor(private readonly core: Core) {}

  async test(kind: CatalogKind, key: string, version: number, opts: { providerKey?: string; task?: TaskType } = {}) {
    const v = await this.core.catalog.getVersion(kind, key, version);
    const validation = await this.core.catalog.validate(kind, v.definition, key);
    if (kind !== 'agent') {
      let promptPreview = '';
      if (kind === 'skill') {
        const skill = skillDefinitionSchema.safeParse(v.definition);
        const host = await this.core.deps.prisma.agent.findUnique({ where: { key: 'FunctionalAnalyst' }, include: { activeVersion: true } });
        if (skill.success && host?.activeVersion) promptPreview = buildSystemPrompt(agentDefinitionSchema.parse(host.activeVersion.definition), [{ key, def: skill.data }]);
      }
      return { validation, promptPreview, run: null };
    }
    const def = agentDefinitionSchema.parse(v.definition);
    const task = (opts.task ?? def.tasks[0]) as TaskType | undefined;
    if (!task) throw new PlatformError('VALIDATION_ERROR', 'El agente no declara tareas para probar');
    const prisma = this.core.deps.prisma;
    const provider = opts.providerKey
      ? await prisma.modelProviderConfiguration.findUnique({ where: { key: opts.providerKey } })
      : await prisma.modelProviderConfiguration.findFirst({ where: { kind: 'MOCK' } });
    if (!provider) throw notFound('Proveedor');
    const demo = await prisma.project.findFirst({ where: { mode: 'DEMO' } });
    const config = demo ? (await this.core.config.resolvedForProject(demo.id)).config : {};
    const context = await sampleContext(task, config);
    const skills = await Promise.all(
      def.skills.map(async (s) => {
        const row = await prisma.skill.findUnique({ where: { key: s }, include: { activeVersion: true } });
        return row?.activeVersion ? { key: s, def: skillDefinitionSchema.parse(row.activeVersion.definition) } : null;
      }),
    );
    const promptPreview = buildSystemPrompt(def, skills.filter((x): x is NonNullable<typeof x> => !!x));
    try {
      const r = await this.core.agents.run({ agentKey: key, task, context, executionProvider: provider, correlationId: `test:${v.id}:${Date.now()}`, agentVersionId: v.id, trace: { origin: 'CATALOG_TEST' } });
      return { validation, promptPreview, userPromptPreview: buildUserPrompt(task, context).slice(0, 4000), run: { ok: true, task, output: r.output, meta: r.meta } };
    } catch (err) {
      return { validation, promptPreview, run: { ok: false, task, error: toPlatformError(err).toJSON() } };
    }
  }
}
