import type { Tone } from '@/components/ui/feedback';

/** Etiquetas y tonos en español para estados del sistema (estado = punto + palabra). */
const MAP: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: 'Pendiente', tone: 'neutral' },
  RUNNING: { label: 'En curso', tone: 'info' },
  WAITING_APPROVAL: { label: 'Espera aprobación', tone: 'warning' },
  RETRYING: { label: 'Reintentando', tone: 'warning' },
  COMPLETED: { label: 'Completada', tone: 'success' },
  FAILED: { label: 'Fallida', tone: 'danger' },
  CANCELLED: { label: 'Cancelada', tone: 'neutral' },
  SKIPPED: { label: 'Omitida', tone: 'neutral' },
  DRAFT: { label: 'Borrador', tone: 'neutral' },
  PENDING_APPROVAL: { label: 'En aprobación', tone: 'warning' },
  APPROVED: { label: 'Aprobada', tone: 'info' },
  ACTIVE: { label: 'Activa', tone: 'success' },
  INACTIVE: { label: 'Inactiva', tone: 'neutral' },
  REJECTED: { label: 'Rechazada', tone: 'danger' },
  ARCHIVED: { label: 'Archivada', tone: 'neutral' },
  APPLIED: { label: 'Aplicada', tone: 'success' },
  PARTIALLY_DECIDED: { label: 'Parcial', tone: 'warning' },
  DECIDED: { label: 'Resuelta', tone: 'success' },
  SUPERSEDED: { label: 'Reemplazada', tone: 'neutral' },
  AUTO_APPROVED: { label: 'Autoaprobado', tone: 'info' },
  DENIED_BY_POLICY: { label: 'Denegado por política', tone: 'danger' },
  CONFLICT: { label: 'Conflicto', tone: 'warning' },
  SUCCEEDED: { label: 'Ejecutada', tone: 'success' },
  SIMULATED: { label: 'Simulada', tone: 'info' },
  UNCERTAIN: { label: 'Incierta', tone: 'warning' },
  BLOCKED: { label: 'Bloqueada', tone: 'danger' },
  IN_PROGRESS: { label: 'En curso', tone: 'info' },
  CONNECTED: { label: 'Conectada', tone: 'success' },
  ERROR: { label: 'Error', tone: 'danger' },
  UNKNOWN: { label: 'Sin diagnosticar', tone: 'neutral' },
  NOT_CONFIGURED: { label: 'No configurado', tone: 'warning' },
  AVAILABLE: { label: 'Disponible', tone: 'success' },
  Disponible: { label: 'Disponible', tone: 'success' },
  'No detectado': { label: 'No detectado', tone: 'warning' },
  Error: { label: 'Error', tone: 'danger' },
};

export function statusInfo(s: string | null | undefined): { label: string; tone: Tone } {
  return (s && MAP[s]) || { label: s ?? '—', tone: 'neutral' };
}

export const MODE_LABEL: Record<string, string> = {
  ALWAYS_APPROVE: 'Aprobación individual',
  BATCH_APPROVAL: 'Aprobación por lote',
  AUTO_APPROVED: 'Autoaprobada',
  DENIED: 'Denegada',
};

export const MODE_TONE: Record<string, Tone> = { ALWAYS_APPROVE: 'warning', BATCH_APPROVAL: 'info', AUTO_APPROVED: 'success', DENIED: 'danger' };

export const SOURCE_LABEL: Record<string, string> = { UI: 'Interfaz web', CLI: 'CLI', CLAUDE_CODE: 'Claude Code', API: 'API' };

export const HANDLER_LABEL: Record<string, string> = {
  'jira.context': 'Contexto Jira (lectura)',
  'agent.task': 'Tarea de agente',
  'approval.gate': 'Compuerta de aprobación',
  'jira.publish': 'Publicación (servicio autorizado)',
  'supervisor.review': 'Revisión del supervisor',
};

export const KIND_LABEL: Record<string, { singular: string; plural: string; path: string }> = {
  agent: { singular: 'Agente', plural: 'Agentes', path: 'agents' },
  skill: { singular: 'Skill', plural: 'Skills', path: 'skills' },
  orchestrator: { singular: 'Orquestador', plural: 'Orquestadores', path: 'orchestrators' },
};

/** Ruta del archivo de una definición, relativa a la carpeta del catálogo. */
export function catalogFilePath(kind: string, key: string): string {
  if (kind === 'agent') return `agents/${key}.md`;
  if (kind === 'skill') return `skills/${key}/SKILL.md`;
  return `orchestrators/${key}.yaml`;
}

/** Estado de un archivo de catalog/ frente a la base (y resultado de sincronizar, exportar o aplicar). */
const FILE_STATE: Record<string, { label: string; tone: Tone }> = {
  IN_SYNC: { label: 'Al día', tone: 'success' },
  MISSING_FILE: { label: 'Falta el archivo', tone: 'info' },
  STALE_FILE: { label: 'Archivo desactualizado', tone: 'info' },
  PENDING_APPROVAL: { label: 'Pendiente de aprobación', tone: 'warning' },
  CHANGED: { label: 'Cambios sin importar', tone: 'warning' },
  NEW: { label: 'Nuevo', tone: 'info' },
  INVALID: { label: 'Inválido', tone: 'danger' },
  INACTIVE: { label: 'Inactivo', tone: 'neutral' },
  EXPORTED: { label: 'Exportado', tone: 'success' },
  REMOVED: { label: 'Borrado', tone: 'neutral' },
  IMPORTED: { label: 'Importado', tone: 'info' },
  APPLIED: { label: 'Aplicado', tone: 'success' },
};

/** En definiciones un cambio se importa (queda pendiente de aprobación); en configuración se aplica explícitamente. */
export function fileStateInfo(state: string, scope: 'catalog' | 'config'): { label: string; tone: Tone } {
  if (scope === 'config' && state === 'CHANGED') return { label: 'Cambios sin aplicar', tone: 'warning' };
  return FILE_STATE[state] ?? { label: state, tone: 'neutral' };
}

export const CONFIG_SUBJECT_LABEL: Record<string, string> = {
  global: 'Configuración global',
  policies: 'Políticas de aprobación',
  connections: 'Conexiones',
  providers: 'Proveedores de IA',
  project: 'Proyecto',
};
