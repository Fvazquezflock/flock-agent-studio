/** Utilidades de presentación compartidas (formato argentino, según el design system). */

export const executionLabel = (n: number): string => `EX-${n}`;
export const approvalLabel = (n: number): string => `AP-${n}`;
export const proposalLabel = (n: number): string => `CP-${n}`;

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** dd/mm/aaaa hh:mm (24 h). */
export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '—';
  if (ms < 1000) return `${ms} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60} s`;
}

export function fmtNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}
