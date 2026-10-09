import { existsSync } from 'node:fs';
import path from 'node:path';
import { OPERATION_TYPES, globalConfigSchema, projectConfigSchema, type ApprovalMode, type OrchestratorDefinition } from '@mao/shared';
import type { Prisma } from '@mao/db';
import type { Actor } from '../context';
import type { Core } from '../core';
import { KIND_META } from '../catalog/catalog-service';
import { CATALOG_KINDS } from '../catalog/file-format';
import type { LoadedCatalogFile } from '../catalog/file-store';
import { CATALOG_STATE_LABEL, FILE_SYNC_ACTOR, summarizeCatalogReports } from '../catalog/sync-service';
import { validateDefinition, type CatalogIndex } from '../catalog/validation';
import { DEFAULT_MODES } from '../policies/policy-engine';
import { contentHash } from '../util/hash';
import { DemoJiraGateway } from '../jira/demo-gateway';

const SEED_ACTOR = 'instalación inicial';
const MANDATORY_OPS = ['DELETE_EXTERNAL', 'ACTIVATE_SKILL', 'ACTIVATE_ORCHESTRATOR'];

/**
 * Carga inicial idempotente: crea lo que falta y nunca pisa cambios del usuario.
 * - Configuración: primero desde los archivos de `catalog/` (ConfigFileService) y después los valores por defecto que falten.
 * - Catálogo: en una instalación nueva (sin agentes, skills ni orquestadores) instala todos los archivos de `catalog/`
 *   como v1 ACTIVE, porque los instala el propietario al configurar la plataforma (queda auditado). Con catálogo en la
 *   base solo informa el estado de los archivos (la sincronización importa lo nuevo como pendiente de aprobación).
 * Con `demo` (o MAO_SEED_DEMO=true) también crea el proveedor simulado y el proyecto DEMO con datos ficticios (pruebas).
 * Sin demo, el proveedor por defecto es Claude Code local y solo se trabaja contra el Jira registrado.
 */
export async function seedDatabase(core: Core, log: (m: string) => void = () => {}, opts: { demo?: boolean } = {}) {
  const demo = opts.demo ?? process.env.MAO_SEED_DEMO === 'true';
  const prisma = core.deps.prisma;
  const actor = { type: 'SYSTEM' as const, id: SEED_ACTOR };

  // ---- Configuración desde catalog/ (global, políticas, proveedores, conexiones, proyectos) ----
  await core.configFiles.seedFromFiles(log);

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
    ...(demo ? [{ key: 'mock', name: 'Simulación determinística', kind: 'MOCK' as const, config: { note: 'Heurísticas sin IA para demo y pruebas' }, isDefault: true }] : []),
    { key: 'claude-local', name: 'Claude Code local (claude -p)', kind: 'LOCAL_CLAUDE' as const, config: { bin: process.env.MAO_CLAUDE_BIN || 'claude', model: 'default', effort: 'medium' }, isDefault: !demo },
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

  // ---- Catálogo (skills, agentes, orquestadores) desde catalog/ ----
  const counts = await Promise.all([prisma.skill.count(), prisma.agent.count(), prisma.orchestrator.count()]);
  if (counts.every((n) => n === 0)) {
    await installCatalog(core, actor, log);
  } else {
    // Base con catálogo: el seed solo informa. Importar (como versiones pendientes de aprobación) lo hacen el arranque de
    // la API, `pnpm mao files sync` o `pnpm catalog:sync`.
    const reports = await core.catalogSync.reconcile(FILE_SYNC_ACTOR, { mode: 'status' });
    log(`Catálogo frente a ${core.catalogFiles.dir}: ${summarizeCatalogReports(reports)}`);
    for (const r of reports.filter((x) => x.state !== 'IN_SYNC' && x.state !== 'INACTIVE')) {
      log(`  ${KIND_META[r.kind].label} ${r.key}: ${CATALOG_STATE_LABEL[r.state]}${r.message ? ` — ${r.message}` : ''}${r.errors?.length ? ` (${r.errors.join('; ')})` : ''}`);
    }
  }

  // ---- Proyecto demo ----
  if (demo && !(await prisma.project.findUnique({ where: { key: 'DEMO' } }))) {
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

type ValidFile = Extract<LoadedCatalogFile, { ok: true }>;

/**
 * Instalación nueva: todos los archivos de `catalog/` como v1 ACTIVE, en una sola transacción. Antes de crear nada valida
 * todos los archivos (esquema y referencias entre ellos): un archivo inválido corta la instalación con un error claro.
 */
async function installCatalog(core: Core, actor: Actor, log: (m: string) => void) {
  const store = core.catalogFiles;
  const files = CATALOG_KINDS.flatMap((kind) => store.list(kind).map((e) => store.load(kind, e.key)).filter((f): f is LoadedCatalogFile => f !== null));
  const errors = files.flatMap((f) => (f.ok ? [] : f.errors.map((e) => `${f.entry.relPath}: ${e}`)));
  const valid = files.filter((f): f is ValidFile => f.ok);
  const index: CatalogIndex = {
    agents: new Map(valid.filter((f) => f.entry.kind === 'agent').map((f) => [f.entry.key, { tasks: (f.definition.tasks as string[] | undefined) ?? [], status: 'ACTIVE' }])),
    skills: new Map(valid.filter((f) => f.entry.kind === 'skill').map((f) => [f.entry.key, { status: 'ACTIVE' }])),
  };
  for (const f of valid) {
    const check = validateDefinition(f.entry.kind, f.definition, index, f.entry.key);
    errors.push(...check.errors.map((e) => `${f.entry.relPath}: ${e}`));
  }
  if (errors.length) {
    throw new Error(`Instalación inicial cancelada: hay archivos inválidos en ${store.dir} (no se creó nada). Corregilos y volvé a correr la carga inicial:\n- ${errors.join('\n- ')}`);
  }
  if (!valid.length) {
    log(`Advertencia: ${store.dir} no tiene agentes, skills ni orquestadores; el catálogo queda vacío`);
    return;
  }

  await core.deps.prisma.$transaction(async (tx) => {
    for (const f of valid) await installFile(core, f, actor, tx);
  });
  for (const f of valid) log(`${KIND_META[f.entry.kind].label} ${f.entry.key} (${f.entry.relPath})`);
}

type Delegate = { create: (args: unknown) => Promise<{ id: string }>; update: (args: unknown) => Promise<unknown> };

async function installFile(core: Core, f: ValidFile, actor: Actor, tx: Prisma.TransactionClient) {
  const { kind, key, relPath } = f.entry;
  const m = KIND_META[kind];
  const db = tx as unknown as Record<string, Delegate>;
  const def = f.definition as { name: string; description?: string };
  const now = new Date();
  // Los pasos del orquestador se materializan (consultas del motor y de la UI).
  const steps =
    kind === 'orchestrator'
      ? {
          steps: {
            create: (f.definition as OrchestratorDefinition).steps.map((s, i) => ({
              key: s.key,
              name: s.name,
              handler: s.handler,
              agentKey: s.agentKey,
              skillKeys: s.skillKeys,
              dependsOn: [...new Set([...s.dependsOn, ...s.inputs])],
              position: i,
              config: { task: s.task, params: s.params, retry: s.retry, onError: s.onError } as object,
            })),
          },
        }
      : {};
  const entity = await db[m.entity].create({ data: { key, name: def.name, description: def.description ?? '', status: 'ACTIVE', createdBy: SEED_ACTOR } });
  const version = await db[m.version].create({
    data: {
      [m.fk]: entity.id,
      version: 1,
      status: 'ACTIVE',
      definition: def as object,
      checksum: contentHash(def),
      changeNote: `Versión inicial (catalog/${relPath})`,
      createdBy: SEED_ACTOR,
      approvedBy: SEED_ACTOR,
      approvedAt: now,
      activatedAt: now,
      ...steps,
    },
  });
  await db[m.entity].update({ where: { id: entity.id }, data: { activeVersionId: version.id } });
  await core.audit.record({ actor, action: `SEED_${kind.toUpperCase()}`, entityType: m.label, entityId: key, summary: `${m.label} ${key}: v1 instalada desde catalog/${relPath}` }, tx);
}
