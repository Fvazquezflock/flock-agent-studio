import { z } from 'zod';
import { APPROVAL_MODES, EXECUTION_SOURCES, OPERATION_TYPES } from './enums';

/** Contratos de la API REST compartidos por backend, CLI y UI. */

export const createExecutionRequest = z.object({
  projectKey: z.string().min(1),
  orchestratorKey: z.string().min(1),
  input: z.record(z.string(), z.string()).default({}),
  source: z.enum(EXECUTION_SOURCES).default('API'),
  providerKey: z.string().optional(),
  requestText: z.string().max(4000).optional(),
});
export type CreateExecutionRequest = z.infer<typeof createExecutionRequest>;

/** Backlog de Jira (solo lectura): épicas o historias del proyecto para elegir qué analizar. */
export const backlogQuery = z.object({
  kind: z.enum(['epic', 'story']).default('epic'),
  /** Historias de una épica. */
  parent: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]*-\d+$/, 'Clave de issue inválida')
    .optional(),
  /** Solo historias sin épica. */
  withoutParent: z
    .enum(['0', '1', 'true', 'false'])
    .transform((v) => v === '1' || v === 'true')
    .optional(),
  /** Clave exacta (SCRUM-5) o texto del resumen. */
  q: z.string().max(100).optional(),
  includeDone: z
    .enum(['0', '1', 'true', 'false'])
    .transform((v) => v === '1' || v === 'true')
    .optional(),
});
export type BacklogQuery = z.infer<typeof backlogQuery>;

export interface BacklogItem {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  parentKey?: string;
  updated?: string;
  url?: string;
  labels: string[];
}

export interface BacklogResult {
  projectKey: string;
  jiraProjectKey: string;
  mode: 'DEMO' | 'LIVE';
  kind: 'epic' | 'story';
  /** Tipo de Jira consultado según el mapeo del proyecto. */
  issueType: string;
  items: BacklogItem[];
  /** Hay más resultados que el límite: refiná la búsqueda. */
  hasMore: boolean;
  limit: number;
}

export const supervisorRequest = z.object({
  text: z.string().min(3).max(4000),
  projectKey: z.string().optional(),
  source: z.enum(EXECUTION_SOURCES).default('API'),
  providerKey: z.string().optional(),
  execute: z.boolean().default(false),
});
export type SupervisorRequest = z.infer<typeof supervisorRequest>;

export const approvalDecisionRequest = z.object({
  approve: z.array(z.string()).default([]),
  reject: z.array(z.string()).default([]),
  comment: z.string().max(4000).default(''),
  channel: z.enum(['UI', 'CLI', 'CLAUDE_CODE', 'API']).default('API'),
  /** Primeros caracteres del hash del snapshot vigente: confirma que se decide sobre lo que se vio. */
  confirmHash: z.string().min(6).optional(),
});
export type ApprovalDecisionRequest = z.infer<typeof approvalDecisionRequest>;

export const approvalItemEditRequest = z.object({
  payload: z.record(z.string(), z.unknown()),
  note: z.string().max(2000).default(''),
});

export const regenerateRequest = z.object({
  feedback: z.string().min(3).max(4000),
});

export const policyUpsertRequest = z.object({
  scope: z.enum(['GLOBAL', 'PROJECT']),
  projectKey: z.string().optional(),
  orchestratorKey: z.string().optional(),
  operationType: z.enum(OPERATION_TYPES),
  mode: z.enum(APPROVAL_MODES),
  mandatory: z.boolean().default(false),
  description: z.string().max(2000).default(''),
  rules: z.record(z.string(), z.unknown()).default({}),
});
export type PolicyUpsertRequest = z.infer<typeof policyUpsertRequest>;

export const versionCreateRequest = z.object({
  definition: z.record(z.string(), z.unknown()),
  changeNote: z.string().max(2000).default(''),
});

export const catalogCreateRequest = z.object({
  key: z.string().min(2).max(64).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  definition: z.record(z.string(), z.unknown()),
  changeNote: z.string().max(2000).default('Versión inicial'),
});

export const projectCreateRequest = z.object({
  key: z.string().min(2).max(20).regex(/^[A-Z][A-Z0-9_]*$/, 'Mayúsculas, números o "_"'),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
  jiraProjectKey: z.string().min(1).max(20),
  mode: z.enum(['DEMO', 'JIRA']).default('DEMO'),
  connectionKey: z.string().optional(),
  providerKey: z.string().optional(),
});

export const projectUpdateRequest = projectCreateRequest.partial().omit({ key: true }).extend({
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
});

export const proposalEditRequest = z.object({
  title: z.string().min(3).optional(),
  problem: z.string().optional(),
  justification: z.string().optional(),
  solution: z.string().optional(),
  definition: z.record(z.string(), z.unknown()).optional(),
  expectedImpact: z.string().optional(),
  risks: z.array(z.string()).optional(),
  suggestedTests: z.array(z.string()).optional(),
});

/** "Confirmar e implementar": hash del plan que el usuario revisó (o sus primeros 12 caracteres). */
export const proposalImplementRequest = z.object({
  confirmHash: z.string().min(12).max(64),
  comment: z.string().max(4000).default(''),
});

export const proposalDecisionRequest = z.object({
  comment: z.string().max(4000).default(''),
  channel: z.enum(['UI', 'CLI', 'CLAUDE_CODE', 'API']).default('API'),
});
