import { PlatformError } from '../util/errors';
import { DEMO_FIELDS, DEMO_ISSUE_TYPES, DEMO_ISSUES, DEMO_LINK_TYPES, DEMO_PROJECT } from './demo-data';
import { JIRA_DOMAIN_OPERATIONS, type CapabilityEntry, type IJiraGateway, type JiraIssue } from './types';

/**
 * Jira de demostración en memoria. Lecturas sobre datos ficticios; las escrituras están prohibidas:
 * el servicio de publicación registra operaciones SIMULATED y nunca llama a estos métodos en modo demo.
 */
export class DemoJiraGateway implements IJiraGateway {
  readonly mode = 'DEMO' as const;
  readonly connectionKey = 'demo';
  private readonly issues: Map<string, JiraIssue>;

  constructor(overrides: Partial<Record<string, Partial<JiraIssue>>> = {}) {
    this.issues = new Map(DEMO_ISSUES.map((i) => [i.key, { ...i, ...(overrides[i.key] ?? {}) }]));
  }

  async capabilities(): Promise<CapabilityEntry[]> {
    return JIRA_DOMAIN_OPERATIONS.map((op) => {
      const write = ['CreateIssue', 'UpdateIssue', 'CreateIssueLink', 'LinkToEpic'].includes(op);
      return { operation: op, supported: !write, tool: write ? null : `demo.${op}`, kind: write ? 'write' : 'read', note: write ? 'Simulado en modo demo' : undefined };
    });
  }

  async getProject(projectKey: string) {
    if (projectKey !== DEMO_PROJECT.key) throw new PlatformError('NOT_FOUND', `Proyecto demo ${projectKey} inexistente`);
    return { ...DEMO_PROJECT };
  }

  async getIssue(key: string): Promise<JiraIssue> {
    const i = this.issues.get(key);
    if (!i) throw new PlatformError('NOT_FOUND', `Issue ${key} no encontrada en los datos demo`);
    return structuredClone(i);
  }

  async searchIssues(jql: string, limit = 50): Promise<JiraIssue[]> {
    const parent = /parent\s*=\s*"?([A-Z][A-Z0-9_]*-\d+)"?/i.exec(jql)?.[1];
    const all = [...this.issues.values()];
    const res = parent ? all.filter((i) => i.parentKey === parent) : all;
    return res.slice(0, limit).map((i) => structuredClone(i));
  }

  async getChildren(parentKey: string, limit = 50) {
    return this.searchIssues(`parent = ${parentKey}`, limit);
  }

  async getIssueTypes() {
    return DEMO_ISSUE_TYPES.map((t) => ({ ...t }));
  }

  async getFields() {
    return DEMO_FIELDS.map((f) => ({ ...f }));
  }

  async getLinkTypes() {
    return DEMO_LINK_TYPES.map((l) => ({ ...l }));
  }

  async createIssue(): Promise<{ key: string }> {
    throw new PlatformError('AUTHORIZATION_ERROR', 'El modo demo no escribe en Jira');
  }

  async updateIssue(): Promise<void> {
    throw new PlatformError('AUTHORIZATION_ERROR', 'El modo demo no escribe en Jira');
  }

  async createIssueLink(): Promise<void> {
    throw new PlatformError('AUTHORIZATION_ERROR', 'El modo demo no escribe en Jira');
  }

  async getTransitions() {
    return [
      { id: 'demo-todo', name: 'Por hacer' },
      { id: 'demo-done', name: 'Listo' },
      { id: 'demo-cancel', name: 'Cancelada' },
    ];
  }

  async transitionIssue(): Promise<void> {
    throw new PlatformError('AUTHORIZATION_ERROR', 'El modo demo nunca escribe en Jira');
  }

  async close() {}
}
