import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Connection, Project } from '@mao/db';
import type { Core } from '../core';
import type { Actor } from '../context';
import { McpStdioClient, resolveStdioConfig, type McpStdioConfig } from '../mcp/mcp-client';
import { FORBIDDEN_TOOLS, computeCapabilities } from '../mcp/capability-map';
import { PlatformError, invalid, notFound, toPlatformError } from '../util/errors';
import { DemoJiraGateway } from './demo-gateway';
import { McpJiraGateway } from './mcp-gateway';
import type { IJiraGateway } from './types';

/**
 * Ruta del archivo de credenciales de una conexión: relativa al repo, dentro de MCP/ (ignorado por git) y
 * terminada en .env. Evita rutas arbitrarias del disco y cualquier cosa que no sea un archivo de entorno.
 */
export function normalizeEnvFile(input: string): string {
  const p = input.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (path.isAbsolute(p) || /^[a-zA-Z]:/.test(p)) throw invalid('El archivo de credenciales debe ser una ruta relativa dentro de MCP/');
  if (p.split('/').some((seg) => seg === '..' || seg === '')) throw invalid('Ruta de credenciales inválida');
  if (!/^MCP\/[A-Za-z0-9._\/-]+$/.test(p)) throw invalid('El archivo de credenciales debe estar dentro de MCP/ (carpeta ignorada por git)');
  if (!p.endsWith('.env')) throw invalid('El archivo de credenciales debe terminar en .env');
  return p;
}

/** Conexiones MCP: diagnóstico, mapa de capacidades y fábrica de gateways (con caché por conexión). */
export class ConnectionService {
  private cache = new Map<string, { gw: IJiraGateway; signature: string }>();

  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  list() {
    return this.prisma.connection.findMany({ orderBy: { key: 'asc' }, include: { projects: { select: { key: true, name: true } } } });
  }

  /** Configuración stdio: siempre el ejecutable del servidor MCP configurado; solo cambia el archivo de credenciales. */
  private stdioConfig(envFile: string): McpStdioConfig {
    return { transport: 'stdio', command: process.env.MAO_JIRA_MCP_COMMAND || 'MCP/mcp-atlassian/.venv/Scripts/mcp-atlassian.exe', args: ['--env-file', envFile] };
  }

  private fileState(envFile: string) {
    const found = existsSync(path.resolve(this.core.deps.repoRoot, envFile));
    return { status: found ? 'UNKNOWN' : 'NOT_CONFIGURED', lastError: found ? null : `Falta el archivo de credenciales ${envFile} (scripts\\setup-mcp.ps1 -EnvFile ${envFile.replace(/^MCP\//, 'MCP\\').replace(/\//g, '\\')})` };
  }

  /** Nueva conexión Jira (otro sitio/cuenta) con el mismo servidor MCP. Escritura deshabilitada al crearla. */
  async create(input: { key: string; name: string; envFile: string }, actor: Actor) {
    if (await this.prisma.connection.findUnique({ where: { key: input.key } })) throw new PlatformError('VERSION_CONFLICT', `Ya existe la conexión ${input.key}`);
    const envFile = normalizeEnvFile(input.envFile);
    const c = await this.prisma.connection.create({
      data: { key: input.key, name: input.name, kind: 'MCP_STDIO', purpose: 'JIRA', config: this.stdioConfig(envFile) as object, writeEnabled: false, ...this.fileState(envFile) },
    });
    await this.core.audit.record({ actor, action: 'CONNECTION_CREATED', entityType: 'Connection', entityId: c.key, summary: `Conexión ${c.key} creada (credenciales en ${envFile}, escritura deshabilitada)` });
    await this.core.configFiles.exportAfterChange(actor);
    return c;
  }

  /** Cambia nombre o archivo de credenciales. El gateway en caché se recrea solo (cambia su firma). */
  async update(key: string, input: { name?: string; envFile?: string }, actor: Actor) {
    const current = await this.get(key);
    const data: Record<string, unknown> = {};
    if (input.name) data.name = input.name;
    if (input.envFile) {
      const envFile = normalizeEnvFile(input.envFile);
      Object.assign(data, { config: { ...(current.config as object), ...this.stdioConfig(envFile) }, capabilities: null, ...this.fileState(envFile) });
    }
    const c = await this.prisma.connection.update({ where: { key }, data });
    await this.core.audit.record({ actor, action: 'CONNECTION_UPDATED', entityType: 'Connection', entityId: key, summary: `Conexión ${key} actualizada${input.envFile ? ` (credenciales en ${normalizeEnvFile(input.envFile)})` : ''}` });
    await this.core.configFiles.exportAfterChange(actor);
    return c;
  }

  async get(key: string) {
    const c = await this.prisma.connection.findUnique({ where: { key }, include: { projects: { select: { key: true, name: true } } } });
    if (!c) throw notFound(`Conexión ${key}`);
    return c;
  }

  /** Gateway para un proyecto: DEMO usa datos ficticios; JIRA usa el MCP real. */
  gatewayFor(project: Project & { connection: Connection | null }): IJiraGateway {
    if (this.core.deps.gatewayFactory) return this.core.deps.gatewayFactory({ project });
    if (project.mode === 'DEMO') return new DemoJiraGateway();
    const conn = project.connection;
    if (!conn) throw new PlatformError('TOOL_UNAVAILABLE', `El proyecto ${project.key} está en modo JIRA pero no tiene conexión asignada`);
    const writeEnabled = conn.writeEnabled && this.core.deps.allowJiraWrites;
    const signature = `${JSON.stringify(conn.config)}|${writeEnabled}`;
    const cached = this.cache.get(conn.key);
    if (cached && cached.signature === signature) return cached.gw;
    if (cached) void cached.gw.close();
    const gw = new McpJiraGateway(conn.key, conn.config as unknown as McpStdioConfig, this.core.deps.repoRoot, writeEnabled);
    this.cache.set(conn.key, { gw, signature });
    return gw;
  }

  async closeAll() {
    await Promise.all([...this.cache.values()].map((c) => c.gw.close()));
    this.cache.clear();
  }

  /** Diagnóstico real: inicia el servidor, enumera herramientas/recursos y calcula el mapa de capacidades. */
  async diagnose(key: string, actor: Actor) {
    const conn = await this.get(key);
    const cfg = resolveStdioConfig(conn.config as unknown as McpStdioConfig, this.core.deps.repoRoot);
    const client = new McpStdioClient(cfg, { timeoutMs: 90_000 });
    const started = Date.now();
    let result: Record<string, unknown>;
    let status = 'ERROR';
    let lastError: string | null = null;
    try {
      await client.connect();
      const tools = client.listTools();
      const resources = await client.listResources();
      const capabilities = computeCapabilities(tools.map((t) => t.name), conn.writeEnabled && this.core.deps.allowJiraWrites);
      status = 'CONNECTED';
      result = {
        transport: 'stdio',
        server: client.serverInfo,
        durationMs: Date.now() - started,
        toolCount: tools.length,
        tools: tools.map((t) => ({ name: t.name, readOnly: t.readOnlyHint ?? null, destructive: t.destructiveHint ?? null, forbidden: FORBIDDEN_TOOLS.includes(t.name) })),
        resources,
        capabilities,
        writePolicy: {
          connectionWriteEnabled: conn.writeEnabled,
          envAllowJiraWrites: this.core.deps.allowJiraWrites,
        },
      };
    } catch (err) {
      const e = toPlatformError(err);
      lastError = `${e.code}: ${e.message}`;
      result = { transport: 'stdio', durationMs: Date.now() - started, error: e.toJSON(), stderr: client.stderr().slice(-8) };
    } finally {
      await client.close();
    }
    const updated = await this.prisma.connection.update({
      where: { key },
      data: { status, lastCheckedAt: new Date(), capabilities: result as object, lastError },
    });
    await this.core.audit.record({ actor, action: 'CONNECTION_DIAGNOSED', entityType: 'Connection', entityId: key, summary: `Diagnóstico MCP ${key}: ${status}`, data: { status, toolCount: result.toolCount, error: lastError } });
    return updated;
  }

  /** Lectura real de prueba (solo herramientas de lectura en modo READ_ONLY). */
  async testRead(key: string, params: { projectKey?: string; issueKey?: string }, actor: Actor) {
    const conn = await this.get(key);
    const gw = new McpJiraGateway(conn.key, conn.config as unknown as McpStdioConfig, this.core.deps.repoRoot, false);
    try {
      const out: Record<string, unknown> = {};
      if (params.projectKey) {
        out.project = await gw.getProject(params.projectKey);
        out.issueTypes = await gw.getIssueTypes(params.projectKey);
      }
      if (params.issueKey) out.issue = await gw.getIssue(params.issueKey);
      if (!params.projectKey && !params.issueKey) out.linkTypes = await gw.getLinkTypes();
      await this.core.audit.record({ actor, action: 'CONNECTION_TEST_READ', entityType: 'Connection', entityId: key, summary: `Lectura de prueba en ${key} (${params.issueKey ?? params.projectKey ?? 'tipos de vínculo'})` });
      return { ok: true, ...out };
    } catch (err) {
      const e = toPlatformError(err);
      return { ok: false, error: e.toJSON() };
    } finally {
      await gw.close();
    }
  }

  async setWriteEnabled(key: string, enabled: boolean, actor: Actor) {
    const conn = await this.prisma.connection.update({ where: { key }, data: { writeEnabled: enabled } });
    this.cache.delete(key);
    await this.core.audit.record({
      actor,
      action: 'CONNECTION_WRITE_TOGGLED',
      entityType: 'Connection',
      entityId: key,
      summary: `Escritura Jira ${enabled ? 'habilitada' : 'deshabilitada'} en la conexión ${key}${enabled && !this.core.deps.allowJiraWrites ? ' (sigue bloqueada: MAO_ALLOW_JIRA_WRITES=false)' : ''}`,
    });
    return conn;
  }

  /** Descubre tipos de issue y campos del proyecto con el conector del proyecto. */
  async discoverProject(projectKey: string, actor: Actor) {
    const project = await this.prisma.project.findUnique({ where: { key: projectKey }, include: { connection: true } });
    if (!project) throw notFound(`Proyecto ${projectKey}`);
    const gw = this.gatewayFor(project);
    const [issueTypes, fields, linkTypes] = await Promise.all([gw.getIssueTypes(project.jiraProjectKey), gw.getFields(project.jiraProjectKey), gw.getLinkTypes()]);
    // Las transiciones dependen del flujo de trabajo: se leen de una historia real del proyecto (para mapear "cancelar").
    const { config } = await this.core.config.resolvedForProject(project.id);
    let transitions: { id: string; name: string }[] = [];
    let transitionsFrom: string | undefined;
    try {
      const sample = (await gw.searchIssues(`project = "${project.jiraProjectKey.replace(/"/g, '')}" AND issuetype = "${config.jira.issueTypes.story.replace(/"/g, '')}" ORDER BY created DESC`, 1))[0];
      if (sample) {
        transitions = await gw.getTransitions(sample.key);
        transitionsFrom = sample.key;
      }
    } catch {
      /* el conector puede no exponer transiciones: queda sin mapear */
    }
    await this.core.audit.record({ actor, action: 'PROJECT_DISCOVERED', entityType: 'Project', entityId: project.key, projectId: project.id, summary: `Descubrimiento Jira de ${project.key}: ${issueTypes.length} tipos, ${fields.length} campos, ${transitions.length} transiciones` });
    return { at: new Date().toISOString(), mode: gw.mode, issueTypes, fields, linkTypes, transitions, transitionsFrom };
  }
}
