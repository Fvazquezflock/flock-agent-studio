'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: { issues?: string[]; errors?: string[] } & Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Todas las llamadas pasan por el proxy del servidor Next (que agrega el token). */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers: { 'x-mao-csrf': '1', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? (method === 'GET' ? undefined : '{}') : JSON.stringify(body),
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: { code: 'INTERNAL', message: text.slice(0, 300) } };
  }
  if (!res.ok) {
    const e = data?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? res.statusText, e.details);
  }
  return data as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>('GET', p),
  post: <T = any>(p: string, b?: unknown) => request<T>('POST', p, b ?? {}),
  put: <T = any>(p: string, b?: unknown) => request<T>('PUT', p, b ?? {}),
  patch: <T = any>(p: string, b?: unknown) => request<T>('PATCH', p, b ?? {}),
};

export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const extra = err.details?.issues ?? err.details?.errors;
    return `${err.message}${Array.isArray(extra) && extra.length ? ` — ${extra.slice(0, 4).join('; ')}` : ''}`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Lectura con estado y recarga; `path = null` no consulta. */
export function useApi<T = any>(path: string | null, opts: { refreshMs?: number } = {}) {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const seq = useRef(0);
  const load = useCallback(
    async (silent = false) => {
      if (!path) return;
      const n = ++seq.current;
      if (!silent) setLoading(true);
      try {
        const d = await api.get<T>(path);
        if (n === seq.current) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (n === seq.current) setError(e);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!opts.refreshMs || !path) return;
    const t = setInterval(() => void load(true), opts.refreshMs);
    return () => clearInterval(t);
  }, [opts.refreshMs, path, load]);
  return { data, error, loading, reload: load, setData };
}

/** EventSource con reconexión automática (el navegador reenvía Last-Event-ID). */
export function useEventStream(path: string | null, onEvent: (type: string, data: any) => void) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!path) return;
    const es = new EventSource(`/api/proxy${path}`);
    const types = ['message', 'status'];
    const listen = (e: MessageEvent) => {
      try {
        handler.current(e.type, JSON.parse(e.data));
      } catch {
        /* ignora eventos mal formados */
      }
    };
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    // Los eventos llevan su tipo como nombre: se escucha el genérico y los conocidos.
    const known = [
      'EXECUTION_CREATED', 'SIMULATION_NOTICE', 'EXECUTION_STARTED', 'STEP_STARTED', 'STEP_COMPLETED', 'STEP_FAILED', 'STEP_SKIPPED', 'STEP_CANCELLED',
      'STEP_RETRY_SCHEDULED', 'STEP_WAITING_APPROVAL', 'STEP_RECOVERED', 'AGENT_INVOKED', 'AGENT_RESULT', 'JIRA_READ', 'CONTEXT_WARNING', 'UNTRUSTED_CONTENT',
      'PARALLEL_STEPS', 'APPROVAL_REQUESTED', 'APPROVAL_DECIDED', 'APPROVAL_ITEM_EDITED', 'PUBLICATION_STARTED', 'OPERATION_SIMULATED', 'OPERATION_EXECUTED',
      'OPERATION_NOT_EXECUTED', 'PROPOSAL_CREATED', 'CONFLICT_DETECTED', 'EXECUTION_WAITING_APPROVAL', 'EXECUTION_COMPLETED', 'EXECUTION_FAILED',
      'EXECUTION_CANCELLED', 'EXECUTION_RETRY', 'REGENERATION_REQUESTED',
    ];
    for (const t of [...types, ...known]) es.addEventListener(t, listen as EventListener);
    return () => es.close();
  }, [path]);
  return { connected };
}
