import type { BacklogItem, BacklogQuery, BacklogResult } from '@mao/shared';
import type { Core } from '../core';
import { notFound } from '../util/errors';
import type { JiraIssue } from './types';

/** Límite de jira_search en mcp-atlassian (1-50). */
export const BACKLOG_LIMIT = 50;

const ISSUE_KEY = /^[A-Z][A-Z0-9_]*-\d+$/;

const sameType = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Literal JQL entre comillas con escapes. */
function jqlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Texto libre seguro para `summary ~`: solo letras, dígitos, espacios y guiones; en minúsculas (AND/OR/NOT no actúan
 * como operadores de la búsqueda de texto) y cada palabra de 3+ letras admite prefijo.
 */
export function backlogSearchText(text: string): string {
  const words = text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .slice(0, 8);
  return words.map((w) => (w.length >= 3 ? `${w}*` : w)).join(' ');
}

/**
 * JQL de solo lectura para el backlog. Los nombres de tipo vienen del mapeo del proyecto (descubierto con el conector);
 * la clave de proyecto y la de la épica se validan con patrón; el texto libre se limpia.
 */
export function buildBacklogJql(p: { jiraProjectKey: string; issueType: string; parentKey?: string; withoutParent?: boolean; text?: string; includeDone?: boolean }): string {
  const parts = [`project = ${jqlString(p.jiraProjectKey)}`, `issuetype = ${jqlString(p.issueType)}`];
  if (p.parentKey && ISSUE_KEY.test(p.parentKey)) parts.push(`parent = ${p.parentKey}`);
  if (p.withoutParent) parts.push('parent is EMPTY');
  if (!p.includeDone) parts.push('statusCategory != Done');
  const text = p.text?.trim();
  if (text) {
    if (ISSUE_KEY.test(text.toUpperCase())) parts.push(`key = ${text.toUpperCase()}`);
    else {
      const clean = backlogSearchText(text);
      if (clean) parts.push(`summary ~ ${jqlString(clean)}`);
    }
  }
  return `${parts.join(' AND ')} ORDER BY updated DESC`;
}

function toItem(i: JiraIssue): BacklogItem {
  return { key: i.key, summary: i.summary, issueType: i.issueType, status: i.status, parentKey: i.parentKey, updated: i.updated, url: i.url, labels: i.labels };
}

/** Backlog de Jira para elegir qué analizar (épica completa o historia suelta). Solo lectura. */
export class BacklogService {
  constructor(private readonly core: Core) {}

  async list(projectKey: string, query: BacklogQuery): Promise<BacklogResult> {
    const project = await this.core.deps.prisma.project.findUnique({ where: { key: projectKey }, include: { connection: true } });
    if (!project) throw notFound(`Proyecto ${projectKey}`);
    const { config } = await this.core.config.resolvedForProject(project.id);
    const issueType = query.kind === 'epic' ? config.jira.issueTypes.epic : config.jira.issueTypes.story;
    const jql = buildBacklogJql({
      jiraProjectKey: project.jiraProjectKey,
      issueType,
      parentKey: query.kind === 'story' ? query.parent : undefined,
      withoutParent: query.kind === 'story' && !query.parent && query.withoutParent,
      text: query.q,
      includeDone: query.includeDone,
    });
    const gw = this.core.connections.gatewayFor(project);
    const issues = await gw.searchIssues(jql, BACKLOG_LIMIT);

    // El gateway demo no interpreta JQL: los filtros estructurales se aplican también acá (en LIVE ya vienen filtrados).
    let found = issues.filter((i) => sameType(i.issueType, issueType));
    if (query.kind === 'story' && query.parent) found = found.filter((i) => i.parentKey === query.parent);
    else if (query.kind === 'story' && query.withoutParent) found = found.filter((i) => !i.parentKey);
    if (gw.mode === 'DEMO' && query.q?.trim()) {
      const t = query.q.trim().toLowerCase();
      found = found.filter((i) => i.key.toLowerCase() === t || i.summary.toLowerCase().includes(t));
    }

    return {
      projectKey: project.key,
      jiraProjectKey: project.jiraProjectKey,
      mode: gw.mode,
      kind: query.kind,
      issueType,
      items: found.map(toItem),
      hasMore: issues.length >= BACKLOG_LIMIT,
      limit: BACKLOG_LIMIT,
    };
  }
}
