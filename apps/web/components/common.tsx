'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { approvalLabel, executionLabel, fmtDateTime } from '@mao/shared';
import { Button, Spinner } from '@/components/ui/core';
import { Alert, StatusBadge } from '@/components/ui/feedback';
import { errorText } from '@/lib/api';
import { MODE_LABEL, MODE_TONE, statusInfo } from '@/lib/labels';

export function Status({ value, size }: { value: string | null | undefined; size?: 'sm' | 'md' }) {
  const s = statusInfo(value);
  return (
    <StatusBadge tone={s.tone} size={size}>
      {s.label}
    </StatusBadge>
  );
}

export function PolicyBadge({ mode }: { mode: string }) {
  return (
    <StatusBadge tone={MODE_TONE[mode] ?? 'neutral'} size="sm">
      {MODE_LABEL[mode] ?? mode}
    </StatusBadge>
  );
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center p-10">
      <Spinner label={label} />
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <Alert tone="danger" title="No pudimos cargar la información" actions={onRetry ? <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>Reintentar</Button> : undefined}>
      {errorText(error)}
    </Alert>
  );
}

export function ExecLink({ id, number }: { id: string; number: number }) {
  return (
    <Link className="fk-link fk-mono" href={`/executions/${id}`}>
      {executionLabel(number)}
    </Link>
  );
}

export function ApprovalLink({ id, number }: { id: string; number: number }) {
  return (
    <Link className="fk-link fk-mono" href={`/approvals/${id}`}>
      {approvalLabel(number)}
    </Link>
  );
}

export function When({ value }: { value: string | Date | null | undefined }) {
  return <span className="fk-num text-ink-muted">{fmtDateTime(value)}</span>;
}

/** Aviso permanente de simulación: el modo demo nunca se presenta como real. */
export function SimulationBanner({ simulation }: { simulation?: { model?: string; jira?: string } | null }) {
  if (!simulation) return null;
  const parts: string[] = [];
  if (simulation.model === 'SIMULATED') parts.push('el modelo es una SIMULACIÓN determinística (no es IA)');
  if (simulation.jira === 'DEMO') parts.push('Jira es un proyecto DEMO con datos ficticios y la publicación es simulada');
  if (!parts.length) return null;
  return (
    <Alert tone="warning" title="Modo demostración">
      En esta ejecución {parts.join(' y ')}. Ningún cambio se escribe en Jira.
    </Alert>
  );
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="fk-h3">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}
