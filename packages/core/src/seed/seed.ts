import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  OPERATION_TYPES,
  agentDefinitionSchema,
  globalConfigSchema,
  orchestratorDefinitionSchema,
  projectConfigSchema,
  skillDefinitionSchema,
  type ApprovalMode,
} from '@mao/shared';
import type { Core } from '../core';
import { DEFAULT_MODES } from '../policies/policy-engine';
import { contentHash } from '../util/hash';
import { DemoJiraGateway } from '../jira/demo-gateway';
import { AGENT_SEEDS } from './agents';
import { ORCHESTRATOR_SEEDS } from './orchestrators';
import { SKILL_SEEDS } from './skills';

const SEED_ACTOR = 'instalación inicial';
const MANDATORY_OPS = ['DELETE_EXTERNAL', 'ACTIVATE_SKILL', 'ACTIVATE_ORCHESTRATOR'];

/**
 * Carga inicial idempotente: crea lo que falta y nunca pisa cambios del usuario.
 * Las versiones iniciales quedan ACTIVE porque las instala el propietario al configurar la plataforma (queda auditado).
 */
export async function seedDatabase(core: Core, log: (m: string) => void = () => {}) {
  const prisma = core.deps.prisma;
  const actor = { type: 'SYSTEM' as const, id: SEED_ACTOR };

  // ---- Configuración global ----
  if (!(await prisma.globalSetting.findUnique({ where: { key: 'global.config' } }))) {
    const value = globalConfigSchema.parse({
      defaults: { language: 'es-AR' },
    });
    await prisma.globalSetting.create({ data: { key: 'global.config', value: value as object, version: 1, updatedBy: SEED_ACTOR } });
    log('Configuración global creada');
  }

  // ---- Políticas por defecto ----
  for (const op of OPERATION_TYPES) {
    const exists = await prisma.approvalPolicy.findFirst({ where: { scope: 'GLOBAL', operationType: op, orchestratorKey: null } });
    if (exists) continue;
    await prisma.approvalPolicy.create({
      data: {
        scope: 'GLOBAL',
        operationType: op,
        mode: DEFAULT_MODES[op] as ApprovalMode,
        mandatory: MANDATORY_OPS.includes(op),
        version: 1,
        description: 'Política por defecto de la plataforma',
        createdBy: SEED_ACTOR,
      },
    });
  }
  log('Políticas globales verificadas');

  // ---- Proveedores de IA (sin secretos) ----
  const providers = [
    { key: 'mock', name: 'Simulación determinística', kind: 'MOCK' as const, config: { note: 'Heurísticas sin IA para demo y pruebas' }, isDefault: true },
    { key: 'claude-local', name: 'Claude Code local (claude -p)', kind: 'LOCAL_CLAUDE' as const, config: { bin: process.env.MAO_CLAUDE_BIN || 'claude', model: 'default', effort: 'medium' }, isDefault: false },
    { key: 'anthropic-api', name: 'API de Anthropic', kind: 'ANTHROPIC_API' as const, config: { model: 'claude-opus-5-5', apiKeyEnv: 'ANTHROPIC_API_KEY', effort: 'medium' }, isDefault: false },
  ];
  for (const p of providers) {
    if (await prisma.modelProviderConfiguration.findUnique({ where: { key: p.key } })) continue;
    await prisma.modelProviderConfiguration.create({ data: p });
    log(`Proveedor ${p.key} creado`);
  }

  // ---- Conexión MCP Jira existente (stdio) ----
  if (!(await prisma.connection.findUnique({ where: { key: 'jira-mcp' } }))) {
    const command = process.env.MAO_JIRA_MCP_COMMAND || 'MCP/mcp-atlassian/.venv/Scripts/mcp-atlassian.exe';
    const args = (process.env.MAO_JIRA_MCP_ARGS || '--env-file MCP/mcp-atlassian/.env').split(/\s+/).filter(Boolean);
    const found = existsSync(path.resolve(core.deps.repoRoot, command));
    await prisma.connection.create({
      data: {
        key: 'jira-mcp',
        name: 'Jira (mcp-atlassian, stdio)',
        kind: 'MCP_STDIO',
        purpose: 'JIRA',
        config: { transport: 'stdio', command, args },
        writeEnabled: false,
        status: found ? 'UNKNOWN' : 'NOT_CONFIGURED',
        lastError: found ? null : `No se encontró ${command}`,
      },
    });
    log('Conexión jira-mcp registrada (escritura deshabilitada)');
  }

  // ---- Skills ----
  for (const s of SKILL_SEEDS) {
    if (await prisma.skill.findUnique({ where: { key: s.key } })) continue;
    const { key, ...rest } = s;
    const def = skillDefinitionSchema.parse(rest);
    await prisma.$transaction(async (tx) => {
      const skill = await tx.skill.create({ data: { key, name: def.name, description: def.description, status: 'ACTIVE', createdBy: SEED_ACTOR } });
      const v = await tx.skillVersion.create({
        data: { skillId: skill.id, version: 1, status: 'ACTIVE', definition: def as object, checksum: contentHash(def), changeNote: 'Versión inicial', createdBy: SEED_ACTOR, approvedBy: SEED_ACTOR, approvedAt: new Date(), activatedAt: new Date() },
      });
      await tx.skill.update({ where: { id: skill.id }, data: { activeVersionId: v.id } });
      await core.audit.record({ actor, action: 'SEED_SKILL', entityType: 'Skill', entityId: key, summary: `Skill ${key} v1 instalada` }, tx);
    });
    log(`Skill ${s.key}`);
  }

  // ---- Agentes ----
  for (const a of AGENT_SEEDS) {
    if (await prisma.agent.findUnique({ where: { key: a.key } })) continue;
    const { key, ...rest } = a;
    const def = agentDefinitionSchema.parse(rest);
    await prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({ data: { key, name: def.name, description: def.description, status: 'ACTIVE', createdBy: SEED_ACTOR } });
      const v = await tx.agentVersion.create({
        data: { agentId: agent.id, version: 1, status: 'ACTIVE', definition: def as object, checksum: contentHash(def), changeNote: 'Versión inicial', createdBy: SEED_ACTOR, approvedBy: SEED_ACTOR, approvedAt: new Date(), activatedAt: new Date() },
      });
      await tx.agent.update({ where: { id: agent.id }, data: { activeVersionId: v.id } });
      await core.audit.record({ actor, action: 'SEED_AGENT', entityType: 'Agente', entityId: key, summary: `Agente ${key} v1 instalado` }, tx);
    });
    log(`Agente ${a.key}`);
  }

  // ---- Orquestadores ----
  for (const o of ORCHESTRATOR_SEEDS) {
    if (await prisma.orchestrator.findUnique({ where: { key: o.key } })) continue;
    const def = orchestratorDefinitionSchema.parse(o.definition);
    const check = await core.catalog.validate('orchestrator', def);
    if (!check.valid) throw new Error(`Orquestador ${o.key} inválido: ${check.errors.join('; ')}`);
    await prisma.$transaction(async (tx) => {
      const orch = await tx.orchestrator.create({ data: { key: o.key, name: def.name, description: def.description, status: 'ACTIVE', createdBy: SEED_ACTOR } });
      const v = await tx.orchestratorVersion.create({
        data: {
          orchestratorId: orch.id,
          version: 1,
          status: 'ACTIVE',
          definition: def as object,
          checksum: contentHash(def),
          changeNote: 'Versión inicial',
          createdBy: SEED_ACTOR,
          approvedBy: SEED_ACTOR,
          approvedAt: new Date(),
          activatedAt: new Date(),
          steps: {
            create: def.steps.map((s, i) => ({ key: s.key, name: s.name, handler: s.handler, agentKey: s.agentKey, skillKeys: s.skillKeys, dependsOn: [...new Set([...s.dependsOn, ...s.inputs])], position: i, config: { task: s.task, params: s.params, retry: s.retry, onError: s.onError } as object })),
          },
        },
      });
      await tx.orchestrator.update({ where: { id: orch.id }, data: { activeVersionId: v.id } });
      await core.audit.record({ actor, action: 'SEED_ORCHESTRATOR', entityType: 'Orquestador', entityId: o.key, summary: `Orquestador ${o.key} v1 instalado` }, tx);
    });
    log(`Orquestador ${o.key}`);
  }

  // ---- Proyecto demo ----
  if (!(await prisma.project.findUnique({ where: { key: 'DEMO' } }))) {
    const gw = new DemoJiraGateway();
    const mock = await prisma.modelProviderConfiguration.findUniqueOrThrow({ where: { key: 'mock' } });
    const config = projectConfigSchema.parse({
      jira: {
        issueTypes: { epic: 'Epic', story: 'Story', task: 'Task', subtask: 'Sub-task' },
        taskHierarchy: 'subtask',
        storyEpicLink: 'parent',
        linkTypes: { blocks: 'Blocks', relates: 'Relates' },
        statuses: ['Por hacer', 'En análisis', 'En curso', 'Listo'],
        discovered: { at: new Date().toISOString(), issueTypes: await gw.getIssueTypes(), fields: await gw.getFields() },
      },
      technologies: ['Java / Spring Boot', 'React', 'Oracle SQL'],
      definitionOfReady: ['Identifica actor y objetivo', 'Tiene criterios de aceptación verificables', 'Sin términos ambiguos', 'Refleja las reglas de negocio de la épica', 'Dependencias identificadas', 'Estimada en story points'],
      definitionOfDone: ['Código revisado y mergeado', 'Pruebas automatizadas en verde', 'Criterios de aceptación verificados por QA', 'Documentación actualizada'],
      rules: ['Los títulos de historias empiezan con un verbo en infinitivo.', 'Toda historia tiene al menos 2 criterios de aceptación.', 'Las tareas técnicas llevan el prefijo de su especialidad.'],
    });
    await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { key: 'DEMO', name: 'Portal de Clientes (demo)', description: 'Proyecto de demostración con datos ficticios. La publicación es siempre simulada.', jiraProjectKey: 'DEMO', mode: 'DEMO', defaultProviderId: mock.id },
      });
      await tx.projectConfiguration.create({ data: { projectId: project.id, version: 1, status: 'ACTIVE', config: config as object, checksum: contentHash(config), changeNote: 'Configuración inicial', createdBy: SEED_ACTOR } });
      await core.audit.record({ actor, action: 'SEED_PROJECT', entityType: 'Project', entityId: 'DEMO', projectId: project.id, summary: 'Proyecto DEMO creado (modo demo)' }, tx);
    });
    log('Proyecto DEMO');
  }
}
