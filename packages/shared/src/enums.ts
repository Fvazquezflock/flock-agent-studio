// Valores espejo de los enums de Prisma (packages/db/prisma/schema.prisma). Mantener sincronizados.

export const EXECUTION_STATUSES = ['PENDING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];
export const TERMINAL_EXECUTION_STATUSES: readonly ExecutionStatus[] = ['COMPLETED', 'FAILED', 'CANCELLED'];

export const STEP_STATUSES = ['PENDING', 'RUNNING', 'WAITING_APPROVAL', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const VERSION_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'ACTIVE', 'INACTIVE', 'REJECTED', 'ARCHIVED'] as const;
export type VersionStatus = (typeof VERSION_STATUSES)[number];

export const ENTITY_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const EXECUTION_SOURCES = ['UI', 'CLI', 'CLAUDE_CODE', 'API'] as const;
export type ExecutionSource = (typeof EXECUTION_SOURCES)[number];

export const APPROVAL_MODES = ['ALWAYS_APPROVE', 'BATCH_APPROVAL', 'AUTO_APPROVED', 'DENIED'] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const PROVIDER_KINDS = ['MOCK', 'LOCAL_CLAUDE', 'ANTHROPIC_API'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];

export const PROPOSAL_KINDS = ['AGENT', 'SKILL', 'ORCHESTRATOR', 'MODIFICATION'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

export const PROPOSAL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'APPLIED'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const APPROVAL_ITEM_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'DENIED_BY_POLICY', 'AUTO_APPROVED', 'CONFLICT'] as const;
export type ApprovalItemStatus = (typeof APPROVAL_ITEM_STATUSES)[number];

/**
 * Tipos de operación sobre los que se aplican políticas de aprobación.
 * Son contratos internos de la plataforma, no nombres de herramientas MCP.
 */
export const OPERATION_TYPES = [
  'READ_EXTERNAL',
  'GENERATE_PROPOSAL',
  'CREATE_ISSUE',
  'UPDATE_ISSUE',
  'CREATE_ISSUE_LINK',
  'TRANSITION_ISSUE',
  'MODIFY_AGENT_CONFIG',
  'ACTIVATE_AGENT',
  'ACTIVATE_SKILL',
  'ACTIVATE_ORCHESTRATOR',
  'APPLY_CAPABILITY_PROPOSAL',
  'DELETE_EXTERNAL',
] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

export const OPERATION_LABELS: Record<OperationType, string> = {
  READ_EXTERNAL: 'Consultar información externa',
  GENERATE_PROPOSAL: 'Generar propuestas',
  CREATE_ISSUE: 'Crear issues en Jira',
  UPDATE_ISSUE: 'Editar issues en Jira',
  CREATE_ISSUE_LINK: 'Crear relaciones entre issues',
  TRANSITION_ISSUE: 'Cancelar issues en Jira (transición de estado)',
  MODIFY_AGENT_CONFIG: 'Modificar configuración activa de agentes',
  ACTIVATE_AGENT: 'Activar versiones de agentes',
  ACTIVATE_SKILL: 'Activar skills',
  ACTIVATE_ORCHESTRATOR: 'Activar orquestadores',
  APPLY_CAPABILITY_PROPOSAL: 'Aprobar propuestas de capacidades',
  DELETE_EXTERNAL: 'Eliminar información',
};

/** Clasificación de errores del motor (determina reintentos). */
export const ERROR_CODES = [
  'AUTH_ERROR',
  'MCP_DISCONNECTED',
  'TOOL_UNAVAILABLE',
  'MODEL_RATE_LIMIT',
  'INVALID_RESPONSE',
  'VERSION_CONFLICT',
  'VALIDATION_ERROR',
  'AUTHORIZATION_ERROR',
  'JIRA_ERROR',
  'TIMEOUT',
  'CANCELLED',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const RETRYABLE_ERROR_CODES: readonly ErrorCode[] = ['MCP_DISCONNECTED', 'MODEL_RATE_LIMIT', 'INVALID_RESPONSE', 'JIRA_ERROR', 'TIMEOUT', 'INTERNAL'];

export const STEP_HANDLERS = ['jira.context', 'agent.task', 'approval.gate', 'jira.publish', 'supervisor.review'] as const;
export type StepHandler = (typeof STEP_HANDLERS)[number];

export const SPECIALTIES = ['BACKEND', 'FRONTEND', 'FULLSTACK', 'QA'] as const;
export type Specialty = (typeof SPECIALTIES)[number];

/**
 * Herramientas que se le pueden otorgar a un agente. Solo lectura controlada:
 * las escrituras externas pasan exclusivamente por el servicio de publicación con aprobación.
 */
export const GRANTABLE_TOOLS = ['jira.read.issue', 'jira.read.search', 'jira.read.project', 'jira.read.fields', 'catalog.read'] as const;
export type GrantableTool = (typeof GRANTABLE_TOOLS)[number];
