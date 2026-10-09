import { z } from 'zod';

/** Esquemas de los contenidos aprobables. El servicio de publicación solo ejecuta lo que cumple estos esquemas. */

export const createIssuePayload = z.object({
  projectKey: z.string().min(1),
  issueType: z.string().min(1),
  summary: z.string().min(3).max(255),
  description: z.string().max(30_000).default(''),
  /** Clave de una issue existente como padre. */
  parentKey: z.string().optional(),
  /** itemKey de otro ítem de la misma solicitud que crea el padre. */
  parentRef: z.string().optional(),
  labels: z.array(z.string()).default([]),
  fields: z.record(z.string(), z.unknown()).default({}),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type CreateIssuePayload = z.infer<typeof createIssuePayload>;

export const updateIssuePayload = z.object({
  issueKey: z.string().min(1),
  summary: z.string().min(3).max(255).optional(),
  description: z.string().max(30_000).optional(),
  /** Marca de versión de Jira al momento de leer la issue (detección de cambios concurrentes). */
  baseUpdated: z.string().optional(),
  baseHash: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type UpdateIssuePayload = z.infer<typeof updateIssuePayload>;

export const createLinkPayload = z.object({
  linkType: z.string().min(1),
  /** Issue "bloqueante": clave existente o itemKey de la solicitud. */
  inwardKey: z.string().optional(),
  inwardRef: z.string().optional(),
  outwardKey: z.string().optional(),
  outwardRef: z.string().optional(),
  reason: z.string().default(''),
});
export type CreateLinkPayload = z.infer<typeof createLinkPayload>;

/** Cancelar una HU existente: transición de estado descubierta con el conector (sin mapear, la publicación real se bloquea). */
export const transitionIssuePayload = z.object({
  issueKey: z.string().min(1),
  transitionId: z.string().nullable(),
  transitionName: z.string().nullable(),
  comment: z.string().max(5000).default(''),
  reason: z.enum(['DUPLICATE', 'OUT_OF_SCOPE', 'OBSOLETE']),
  duplicateOf: z.string().optional(),
  baseUpdated: z.string().optional(),
  baseHash: z.string().optional(),
});
export type TransitionIssuePayload = z.infer<typeof transitionIssuePayload>;

export const activationPayload = z.object({
  kind: z.enum(['agent', 'skill', 'orchestrator']),
  key: z.string(),
  versionId: z.string(),
  version: z.number().int(),
  checksum: z.string(),
  definition: z.unknown(),
});

export const proposalPayload = z.object({
  proposalId: z.string(),
  revision: z.number().int(),
  definitionHash: z.string(),
  kind: z.string(),
  targetKey: z.string(),
  definition: z.unknown(),
});

export function payloadSchemaFor(operationType: string) {
  switch (operationType) {
    case 'CREATE_ISSUE':
      return createIssuePayload;
    case 'UPDATE_ISSUE':
      return updateIssuePayload;
    case 'CREATE_ISSUE_LINK':
      return createLinkPayload;
    case 'TRANSITION_ISSUE':
      return transitionIssuePayload;
    case 'ACTIVATE_AGENT':
    case 'ACTIVATE_SKILL':
    case 'ACTIVATE_ORCHESTRATOR':
      return activationPayload;
    case 'APPLY_CAPABILITY_PROPOSAL':
      return proposalPayload;
    default:
      return null;
  }
}

/** Solo los contenidos de Jira se editan desde la aprobación; activaciones y propuestas se editan en su origen. */
export const EDITABLE_OPERATIONS = ['CREATE_ISSUE', 'UPDATE_ISSUE', 'CREATE_ISSUE_LINK'];
