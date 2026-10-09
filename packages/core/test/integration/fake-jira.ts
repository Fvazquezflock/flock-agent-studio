import { DEMO_FIELDS, DEMO_ISSUE_TYPES, DEMO_ISSUES, DEMO_LINK_TYPES } from '../../src/jira/demo-data';
import type { CapabilityEntry, CreateIssueInput, CreateLinkInput, IJiraGateway, JiraIssue, UpdateIssueInput } from '../../src/jira/types';
import { PlatformError } from '../../src/util/errors';

/**
 * Jira en memoria que se comporta como una conexión REAL (mode LIVE) para probar
 * escrituras, idempotencia, reconciliación y conflictos sin tocar ningún Jira.
 */
export class FakeLiveJira implements IJiraGateway {
  readonly mode = 'LIVE' as const;
  readonly connectionKey = 'fake';
  issues = new Map<string, JiraIssue>(DEMO_ISSUES.map((i) => [i.key, structuredClone(i)]));
  creates = 0;
  updates = 0;
  links: CreateLinkInput[] = [];
  transitions: { issueKey: string; transitionId: string; comment?: string }[] = [];
  static readonly TRANSITIONS = [
    { id: '21', name: 'Por hacer' },
    { id: '91', name: 'Cancelada' },
  ];
  seq = 900;
  /** Simula un timeout DESPUÉS de aplicar la creación (resultado incierto). */
  timeoutAfterCreate = 0;
  failGetIssue: string | null = null;

  async capabilities(): Promise<CapabilityEntry[]> {
    return [];
  }
  async getProject(projectKey: string) {
    return { key: projectKey, name: 'Fake' };
  }
  async getIssue(key: string) {
    if (this.failGetIssue) throw new PlatformError(this.failGetIssue as 'MCP_DISCONNECTED', 'Servidor MCP desconectado (simulado)');
    const i = this.issues.get(key);
    if (!i) throw new PlatformError('NOT_FOUND', `${key} no existe`);
    return structuredClone(i);
  }
  async searchIssues(jql: string, limit = 50) {
    const parent = /parent\s*=\s*"?([A-Z]+-\d+)"?/.exec(jql)?.[1];
    const label = /labels\s*=\s*"([^"]+)"/.exec(jql)?.[1];
    let all = [...this.issues.values()];
    if (parent) all = all.filter((i) => i.parentKey === parent);
    if (label) all = all.filter((i) => i.labels.includes(label));
    return all.slice(0, limit).map((i) => structuredClone(i));
  }
  async getChildren(parentKey: string) {
    return this.searchIssues(`parent = ${parentKey}`);
  }
  async getIssueTypes() {
    return DEMO_ISSUE_TYPES;
  }
  async getFields() {
    return DEMO_FIELDS;
  }
  async getLinkTypes() {
    return DEMO_LINK_TYPES;
  }
  async createIssue(input: CreateIssueInput) {
    this.creates++;
    const key = `DEMO-${++this.seq}`;
    this.issues.set(key, {
      key,
      projectKey: input.projectKey,
      issueType: input.issueType,
      summary: input.summary,
      description: input.description,
      status: 'Por hacer',
      labels: input.labels ?? [],
      parentKey: input.parentKey,
      subtasks: [],
      links: [],
      updated: new Date().toISOString(),
    });
    if (this.timeoutAfterCreate > 0) {
      this.timeoutAfterCreate--;
      throw new PlatformError('TIMEOUT', 'Timeout simulado después de crear');
    }
    return { key };
  }
  async updateIssue(input: UpdateIssueInput) {
    this.updates++;
    const i = this.issues.get(input.issueKey)!;
    if (input.summary !== undefined) i.summary = input.summary;
    if (input.description !== undefined) i.description = input.description;
    i.updated = `${new Date().toISOString()}#${this.updates}`;
  }
  async createIssueLink(input: CreateLinkInput) {
    this.links.push(input);
    const inward = this.issues.get(input.inwardKey);
    inward?.links.push({ type: input.linkType, direction: 'inward', label: 'is blocked by', issue: { key: input.outwardKey } });
  }
  /** Simula que alguien editó la issue en Jira mientras la ejecución esperaba. */
  touch(key: string) {
    const i = this.issues.get(key)!;
    i.description = `${i.description}\n(editado por otra persona)`;
    i.updated = `${new Date().toISOString()}#touch`;
  }
  async getTransitions() {
    return FakeLiveJira.TRANSITIONS;
  }
  async transitionIssue(input: { issueKey: string; transitionId: string; comment?: string }) {
    this.transitions.push(input);
    const i = this.issues.get(input.issueKey);
    if (i) {
      i.status = FakeLiveJira.TRANSITIONS.find((t) => t.id === input.transitionId)?.name ?? i.status;
      i.updated = `${new Date().toISOString()}#t${this.transitions.length}`;
    }
  }
  async close() {}
}
