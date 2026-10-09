/**
 * Contratos internos de dominio para Jira. No son nombres de herramientas MCP: el adaptador
 * los traduce a las herramientas realmente descubiertas en el servidor.
 */

export const JIRA_DOMAIN_OPERATIONS = [
  'GetProject',
  'GetIssue',
  'SearchIssues',
  'GetIssueTypes',
  'GetFields',
  'GetIssueLinks',
  'GetLinkTypes',
  'CreateIssue',
  'UpdateIssue',
  'CreateIssueLink',
  'LinkToEpic',
  'GetTransitions',
  'TransitionIssue',
] as const;
export type JiraDomainOperation = (typeof JIRA_DOMAIN_OPERATIONS)[number];

export interface CapabilityEntry {
  operation: JiraDomainOperation;
  supported: boolean;
  tool: string | null;
  kind: 'read' | 'write';
  note?: string;
}

export interface JiraIssueRef {
  key: string;
  summary?: string;
  issueType?: string;
  status?: string;
}

export interface JiraIssueLink {
  type: string;
  direction: 'inward' | 'outward';
  /** Texto de la relación desde esta issue (p. ej. "is blocked by"). */
  label: string;
  issue: JiraIssueRef;
}

export interface JiraIssue {
  key: string;
  id?: string;
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  status: string;
  priority?: string;
  labels: string[];
  parentKey?: string;
  subtasks: JiraIssueRef[];
  links: JiraIssueLink[];
  created?: string;
  /** Marca de versión usada para detectar cambios concurrentes. */
  updated?: string;
  url?: string;
}

export interface JiraIssueType {
  id: string;
  name: string;
  subtask?: boolean;
}

export interface JiraField {
  id: string;
  name: string;
  custom?: boolean;
}

export interface JiraProjectInfo {
  key: string;
  name: string;
}

export interface CreateIssueInput {
  projectKey: string;
  issueType: string;
  summary: string;
  description: string;
  parentKey?: string;
  labels?: string[];
  /** Solo ids de campos descubiertos. */
  fields?: Record<string, unknown>;
}

export interface UpdateIssueInput {
  issueKey: string;
  summary?: string;
  description?: string;
  fields?: Record<string, unknown>;
}

export interface CreateLinkInput {
  linkType: string;
  /** Issue que "bloquea" (outward) — p. ej. A blocks B: outwardKey = A?, según convención Jira inward/outward. */
  inwardKey: string;
  outwardKey: string;
}

export interface IJiraGateway {
  readonly mode: 'DEMO' | 'LIVE';
  readonly connectionKey: string;
  capabilities(): Promise<CapabilityEntry[]>;
  getProject(projectKey: string): Promise<JiraProjectInfo>;
  getIssue(key: string): Promise<JiraIssue>;
  searchIssues(jql: string, limit?: number): Promise<JiraIssue[]>;
  /** Hijos directos (historias de una épica o subtareas de una historia). */
  getChildren(parentKey: string, limit?: number): Promise<JiraIssue[]>;
  getIssueTypes(projectKey: string): Promise<JiraIssueType[]>;
  getFields(projectKey: string): Promise<JiraField[]>;
  getLinkTypes(): Promise<{ name: string; inward: string; outward: string }[]>;
  createIssue(input: CreateIssueInput): Promise<{ key: string; id?: string }>;
  updateIssue(input: UpdateIssueInput): Promise<void>;
  createIssueLink(input: CreateLinkInput): Promise<void>;
  /** Transiciones disponibles para una issue (el flujo de trabajo puede variar por tipo). */
  getTransitions(issueKey: string): Promise<{ id: string; name: string }[]>;
  transitionIssue(input: { issueKey: string; transitionId: string; comment?: string }): Promise<void>;
  close(): Promise<void>;
}
