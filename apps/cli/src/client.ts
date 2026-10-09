import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export function loadEnv() {
  const file = path.join(repoRoot, '.env');
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Cliente de la API de la plataforma. La CLI nunca accede a la base ni al motor directamente. */
export class ApiClient {
  readonly base: string;
  private readonly token: string;
  readonly channel: 'CLI' | 'CLAUDE_CODE';

  constructor() {
    loadEnv();
    this.base = (process.env.MAO_API_URL || `http://127.0.0.1:${process.env.MAO_API_PORT || 4317}`).replace(/\/$/, '');
    this.token = process.env.MAO_OWNER_TOKEN || '';
    this.channel = process.env.MAO_SOURCE === 'CLAUDE_CODE' || process.env.CLAUDECODE === '1' ? 'CLAUDE_CODE' : 'CLI';
  }

  private headers(json = true): Record<string, string> {
    const h: Record<string, string> = { Authorization: `Bearer ${this.token}`, 'X-MAO-Channel': this.channel };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  async request<T = any>(method: string, url: string, body?: unknown): Promise<T> {
    if (!this.token) throw new ApiError(0, 'AUTH_ERROR', 'MAO_OWNER_TOKEN no está definido: ejecutá scripts/setup.ps1 o revisá .env');
    let res: Response;
    try {
      res = await fetch(`${this.base}${url}`, { method, headers: this.headers(body !== undefined), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch (err) {
      throw new ApiError(0, 'MCP_DISCONNECTED', `No se pudo conectar con la API en ${this.base}. ¿Está iniciada? (pnpm dev:api) — ${(err as Error).message}`);
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = data?.error ?? {};
      throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? res.statusText, e.details);
    }
    return data as T;
  }

  get<T = any>(url: string) {
    return this.request<T>('GET', url);
  }
  post<T = any>(url: string, body: unknown = {}) {
    return this.request<T>('POST', url, body);
  }

  /** Sigue un stream SSE; el callback devuelve true para cortar. */
  async stream(url: string, onEvent: (type: string, data: any) => boolean | void, signal?: AbortSignal): Promise<void> {
    const res = await fetch(`${this.base}${url}`, { headers: { ...this.headers(false), Accept: 'text/event-stream' }, signal });
    if (!res.ok || !res.body) throw new ApiError(res.status, 'INTERNAL', `No se pudo abrir el stream (${res.status})`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        let type = 'message';
        let data = '';
        for (const line of chunk.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trim();
        }
        if (!data) continue;
        if (onEvent(type, JSON.parse(data))) {
          await reader.cancel();
          return;
        }
      }
    }
  }
}
