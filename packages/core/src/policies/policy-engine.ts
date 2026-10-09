import type { ApprovalMode, OperationType } from '@mao/shared';

/**
 * Motor de políticas de aprobación. La resolución es una función pura: el backend la aplica
 * siempre antes de cualquier operación sensible; nunca depende de instrucciones del modelo.
 */

export interface PolicyRecord {
  id: string;
  scope: 'GLOBAL' | 'PROJECT';
  projectId: string | null;
  orchestratorKey: string | null;
  operationType: string;
  mode: ApprovalMode;
  mandatory: boolean;
  version: number;
  status: string;
}

export interface ResolvedPolicy {
  operationType: OperationType;
  mode: ApprovalMode;
  policyId: string | null;
  policyVersion: number | null;
  source: 'OPERATION' | 'PROJECT' | 'GLOBAL' | 'DEFAULT';
  reasons: string[];
}

export const STRICTNESS: Record<ApprovalMode, number> = { AUTO_APPROVED: 0, BATCH_APPROVAL: 1, ALWAYS_APPROVE: 2, DENIED: 3 };

/** Política por defecto cuando no hay ninguna registrada. */
export const DEFAULT_MODES: Record<OperationType, ApprovalMode> = {
  READ_EXTERNAL: 'AUTO_APPROVED',
  GENERATE_PROPOSAL: 'AUTO_APPROVED',
  CREATE_ISSUE: 'BATCH_APPROVAL',
  UPDATE_ISSUE: 'ALWAYS_APPROVE',
  CREATE_ISSUE_LINK: 'BATCH_APPROVAL',
  TRANSITION_ISSUE: 'ALWAYS_APPROVE',
  MODIFY_AGENT_CONFIG: 'ALWAYS_APPROVE',
  ACTIVATE_AGENT: 'ALWAYS_APPROVE',
  ACTIVATE_SKILL: 'ALWAYS_APPROVE',
  ACTIVATE_ORCHESTRATOR: 'ALWAYS_APPROVE',
  APPLY_CAPABILITY_PROPOSAL: 'ALWAYS_APPROVE',
  DELETE_EXTERNAL: 'DENIED',
};

/**
 * Piso de seguridad definido en código: ninguna política en base de datos puede relajarlo.
 * Eliminar está prohibido; activar capacidades y cambiar agentes activos requiere aprobación explícita.
 */
export const HARD_FLOOR: Partial<Record<OperationType, ApprovalMode>> = {
  DELETE_EXTERNAL: 'DENIED',
  // Cancelar una HU existente cambia su estado en Jira: siempre aprobación individual.
  TRANSITION_ISSUE: 'ALWAYS_APPROVE',
  ACTIVATE_SKILL: 'ALWAYS_APPROVE',
  ACTIVATE_ORCHESTRATOR: 'ALWAYS_APPROVE',
  ACTIVATE_AGENT: 'BATCH_APPROVAL',
  MODIFY_AGENT_CONFIG: 'BATCH_APPROVAL',
  APPLY_CAPABILITY_PROPOSAL: 'ALWAYS_APPROVE',
};

export const stricter = (a: ApprovalMode, b: ApprovalMode): ApprovalMode => (STRICTNESS[a] >= STRICTNESS[b] ? a : b);

function latest(list: PolicyRecord[]): PolicyRecord | undefined {
  return list.reduce<PolicyRecord | undefined>((acc, p) => (!acc || p.version > acc.version ? p : acc), undefined);
}

export function resolvePolicy(
  policies: PolicyRecord[],
  operationType: OperationType,
  ctx: { projectId?: string | null; orchestratorKey?: string | null } = {},
): ResolvedPolicy {
  const active = policies.filter((p) => p.operationType === operationType && p.status === 'ACTIVE');
  const global = latest(active.filter((p) => p.scope === 'GLOBAL' && !p.orchestratorKey));
  const project = ctx.projectId ? latest(active.filter((p) => p.scope === 'PROJECT' && p.projectId === ctx.projectId && !p.orchestratorKey)) : undefined;
  const operation =
    ctx.projectId && ctx.orchestratorKey
      ? latest(active.filter((p) => p.scope === 'PROJECT' && p.projectId === ctx.projectId && p.orchestratorKey === ctx.orchestratorKey))
      : undefined;

  const reasons: string[] = [];
  const chosen = operation ?? project ?? global;
  let mode: ApprovalMode = chosen?.mode ?? DEFAULT_MODES[operationType];
  const source: ResolvedPolicy['source'] = operation ? 'OPERATION' : project ? 'PROJECT' : global ? 'GLOBAL' : 'DEFAULT';
  reasons.push(chosen ? `Política ${source.toLowerCase()} v${chosen.version}: ${chosen.mode}` : `Sin política registrada: valor por defecto ${mode}`);

  if (global?.mandatory && global !== chosen && STRICTNESS[global.mode] > STRICTNESS[mode]) {
    reasons.push(`La política global obligatoria v${global.version} impone ${global.mode}`);
    mode = global.mode;
  }
  const floor = HARD_FLOOR[operationType];
  if (floor && STRICTNESS[floor] > STRICTNESS[mode]) {
    reasons.push(`Piso de seguridad del sistema: ${floor}`);
    mode = floor;
  }
  return {
    operationType,
    mode,
    policyId: chosen?.id ?? null,
    policyVersion: chosen?.version ?? null,
    source,
    reasons,
  };
}

/**
 * Valida si una nueva política puede registrarse. Devuelve el motivo del rechazo o null.
 * Ningún ámbito inferior puede relajar una política global obligatoria ni el piso del sistema.
 */
export function checkPolicyChange(
  existing: PolicyRecord[],
  next: { scope: 'GLOBAL' | 'PROJECT'; operationType: OperationType; mode: ApprovalMode; mandatory: boolean },
): string | null {
  const floor = HARD_FLOOR[next.operationType];
  if (floor && STRICTNESS[next.mode] < STRICTNESS[floor]) {
    return `La operación ${next.operationType} tiene un piso de seguridad ${floor}: no se puede configurar como ${next.mode}.`;
  }
  if (next.scope === 'PROJECT') {
    if (next.mandatory) return 'Solo las políticas globales pueden marcarse como obligatorias.';
    const global = latest(existing.filter((p) => p.operationType === next.operationType && p.scope === 'GLOBAL' && p.status === 'ACTIVE' && !p.orchestratorKey));
    if (global?.mandatory && STRICTNESS[next.mode] < STRICTNESS[global.mode]) {
      return `La política global obligatoria exige al menos ${global.mode} para ${next.operationType}.`;
    }
  }
  return null;
}
