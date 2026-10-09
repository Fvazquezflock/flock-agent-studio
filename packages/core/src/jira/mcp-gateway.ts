import { McpStdioClient, resolveStdioConfig, type McpStdioConfig } from '../mcp/mcp-client';
import { WRITE_CLIENT_TOOLS, computeCapabilities } from '../mcp/capability-map';
import { PlatformError } from '../util/errors';
import type { CapabilityEntry, CreateIssueInput, CreateLinkInput, IJiraGateway, JiraField, JiraIssue, JiraIssueLink, JiraIssueRef, JiraIssueType, UpdateIssueInput } from './types';

type Json = Record<string, any>;

const ISSUE_FIELDS = 'summary,issuetype,status,description,updated,created,parent,subtasks,issuelinks,labels,priority,project';

function ref(x: Json | undefined): JiraIssueRef | undefined {
  if (!x) return undefined;
  if (typeof x === 'string') return { key: x };
  const f = x.fields ?? {};
  return {
    key: x.key,
    summary: x.summary ?? f.summary,
    issueType: x.issue_type?.name ?? x.issuetype?.name ?? f.issuetype?.name,
    status: x.status?.name ?? f.status?.name,
  };
}

/** Normaliza la salida simplificada de mcp-atlassian (formato verificado contra Jira Cloud). */
export function parseMcpIssue(j: Json): JiraIssue {
  const links: JiraIssueLink[] = [];
  for (const l of (j.issuelinks ?? j.issue_links ?? []) as Json[]) {
    const type = l.type?.name ?? l.type ?? 'Relates';
    const outward = l.outward_issue ?? l.outwardIssue;
    const inward = l.inward_issue ?? l.inwardIssue;
    if (outward) links.push({ type, direction: 'outward', label: l.type?.outward ?? 'outward', issue: ref(outward)! });
    if (inward) links.push({ type, direction: 'inward', label: l.type?.inward ?? 'inward', issue: ref(inward)! });
  }
  const key = String(j.key);
  return {
    key,
    id: j.id ? String(j.id) : undefined,
    projectKey: j.project?.key ?? key.split('-')[0],
    issueType: j.issue_type?.name ?? j.issuetype?.name ?? '',
    summary: j.summary ?? '',
    description: typeof j.description === 'string' ? j.description : '',
    status: j.status?.name ?? '',
    priority: j.priority?.name,
    labels: Array.isArray(j.labels) ? j.labels : [],
    parentKey: typeof j.parent === 'string' ? j.parent : j.parent?.key,
    subtasks: ((j.subtasks ?? []) as Json[]).map((s) => ref(s)!).filter(Boolean),
    links,
    created: j.created,
    updated: j.updated,
    url: j.browse_url ?? j.url,
  };
}

/**
 * Traduce un vínculo del dominio (outwardKey = issue que bloquea, inwardKey = issue bloqueada) a los argumentos
 * de jira_create_issue_link. Verificado contra Jira Cloud (2026-10-09, SCRUM-6 → SCRUM-9): la issue enviada como
 * `inward_issue_key` es la que recibe la descripción saliente ("blocks"), así que los roles se cruzan.
 */
export function mcpLinkArgs(input: CreateLinkInput): { link_type: string; inward_issue_key: string; outward_issue_key: string } {
  return { link_type: input.linkType, inward_issue_key: input.outwardKey, outward_issue_key: input.inwardKey };
}

/**
 * Gateway Jira real sobre el servidor MCP existente (stdio).
 * - Lecturas: proceso MCP con READ_ONLY_MODE=true (el servidor rechaza escrituras).
 * - Escrituras: proceso separado con ENABLED_TOOLS restringido; solo lo usa el servicio de publicación
 *   después de validar aprobación, política y habilitación explícita.
 */
export class McpJiraGateway implements IJiraGateway {
  readonly mode = 'LIVE' as const;
  private reader?: McpStdioClient;
  private writer?: McpStdioClient;
  private readonly cfg: McpStdioConfig;

  constructor(
    readonly connectionKey: string,
    cfg: McpStdioConfig,
    repoRoot: string,
    private readonly writeEnabled: boolean,
  ) {
    this.cfg = resolveStdioConfig(cfg, repoRoot);
  }

  private async read(): Promise<McpStdioClient> {
    // Un único proceso lector por gateway, aunque haya lecturas concurrentes.
    if (!this.reader) this.reader = new McpStdioClient({ ...this.cfg, env: { ...(this.cfg.env ?? {}), READ_ONLY_MODE: 'true' } });
    await this.reader.connect();
    return this.reader;
  }

  private async write(): Promise<McpStdioClient> {
    if (!this.writeEnabled) throw new PlatformError('AUTHORIZATION_ERROR', 'La conexión Jira no tiene habilitada la escritura');
    if (!this.writer) this.writer = new McpStdioClient({ ...this.cfg, env: { ...(this.cfg.env ?? {}), ENABLED_TOOLS: WRITE_CLIENT_TOOLS.join(',') } });
    await this.writer.connect();
    return this.writer;
  }

  async capabilities(): Promise<CapabilityEntry[]> {
    // Listado sin READ_ONLY_MODE: solo enumera herramientas, no ejecuta ninguna.
    const lister = new McpStdioClient(this.cfg);
    try {
      await lister.connect();
      return computeCapabilities(lister.listTools().map((t) => t.name), this.writeEnabled);
    } finally {
      await lister.close();
    }
  }

  async getProject(projectKey: string) {
    const c = await this.read();
    const all = (await c.callTool('jira_get_all_projects', {})) as Json[];
    const p = Array.isArray(all) ? all.find((x) => x.key === projectKey) : undefined;
    if (!p) throw new PlatformError('NOT_FOUND', `El proyecto ${projectKey} no existe o no es accesible con la conexión actual`);
    return { key: p.key, name: p.name };
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const c = await this.read();
    const j = (await c.callTool('jira_get_issue', { issue_key: key, fields: ISSUE_FIELDS, comment_limit: 0 })) as Json;
    if (!j || typeof j !== 'object' || !j.key) throw new PlatformError('INVALID_RESPONSE', `Respuesta inesperada al leer ${key}`);
    return parseMcpIssue(j);
  }

  async searchIssues(jql: string, limit = 50): Promise<JiraIssue[]> {
    const c = await this.read();
    const r = (await c.callTool('jira_search', { jql, fields: ISSUE_FIELDS, limit })) as Json;
    return ((r?.issues ?? []) as Json[]).map(parseMcpIssue);
  }

  async getChildren(parentKey: string, limit = 50) {
    return this.searchIssues(`parent = ${parentKey} ORDER BY key ASC`, limit);
  }

  async getIssueTypes(projectKey: string): Promise<JiraIssueType[]> {
    const c = await this.read();
    const r = (await c.callTool('jira_get_project_issue_types', { project_key: projectKey })) as Json[];
    return (Array.isArray(r) ? r : []).map((t) => ({ id: String(t.id), name: t.name, subtask: !!t.subtask }));
  }

  async getFields(projectKey: string): Promise<JiraField[]> {
    const c = await this.read();
    let r: unknown;
    if (c.hasTool('jira_get_project_fields')) {
      try {
        r = await c.callTool('jira_get_project_fields', { project_key: projectKey });
      } catch {
        r = undefined;
      }
    }
    // Verificado contra Jira Cloud: jira_get_project_fields puede devolver una lista vacía; se usa el catálogo global.
    if (!Array.isArray(r) || r.length === 0) r = await c.callTool('jira_search_fields', { limit: 200 });
    const list = Array.isArray(r) ? (r as Json[]) : ((r as Json)?.fields ?? []);
    return list.map((f: Json) => ({ id: String(f.id ?? f.key), name: f.name, custom: !!f.custom }));
  }

  async getLinkTypes() {
    const c = await this.read();
    const r = (await c.callTool('jira_get_link_types', {})) as Json[];
    return (Array.isArray(r) ? r : []).map((l) => ({ name: l.name, inward: l.inward, outward: l.outward }));
  }

  async createIssue(input: CreateIssueInput): Promise<{ key: string; id?: string }> {
    const c = await this.write();
    const additional: Record<string, unknown> = { ...(input.fields ?? {}) };
    if (input.parentKey) additional.parent = input.parentKey;
    if (input.labels?.length) additional.labels = input.labels;
    const r = (await c.callTool('jira_create_issue', {
      project_key: input.projectKey,
      summary: input.summary,
      issue_type: input.issueType,
      description: input.description,
      additional_fields: Object.keys(additional).length ? additional : undefined,
    })) as Json;
    const key = r?.issue?.key ?? r?.key;
    if (!key) throw new PlatformError('INVALID_RESPONSE', 'Jira no devolvió la clave de la issue creada', { response: r });
    return { key, id: r?.issue?.id ?? r?.id };
  }

  async updateIssue(input: UpdateIssueInput): Promise<void> {
    const c = await this.write();
    const fields: Record<string, unknown> = { ...(input.fields ?? {}) };
    if (input.summary !== undefined) fields.summary = input.summary;
    if (input.description !== undefined) fields.description = input.description;
    await c.callTool('jira_update_issue', { issue_key: input.issueKey, fields });
  }

  async createIssueLink(input: CreateLinkInput): Promise<void> {
    const c = await this.write();
    await c.callTool('jira_create_issue_link', mcpLinkArgs(input));
  }

  async getTransitions(issueKey: string) {
    const c = await this.read();
    const r = (await c.callTool('jira_get_transitions', { issue_key: issueKey })) as Json[];
    return (Array.isArray(r) ? r : []).map((t) => ({ id: String(t.id), name: String(t.name ?? t.to?.name ?? t.id) }));
  }

  async transitionIssue(input: { issueKey: string; transitionId: string; comment?: string }) {
    const c = await this.write();
    await c.callTool('jira_transition_issue', { issue_key: input.issueKey, transition_id: input.transitionId, comment: input.comment || undefined });
  }

  async close() {
    await Promise.all([this.reader?.close(), this.writer?.close()]);
  }
}
