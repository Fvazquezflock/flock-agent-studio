import { RETRYABLE_ERROR_CODES, type ErrorCode } from '@mao/shared';

/** Error tipado del dominio. `code` decide si un paso se reintenta. */
export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PlatformError';
    this.code = code;
    this.details = details;
    this.httpStatus = HTTP_STATUS[code] ?? 500;
  }

  toJSON(): SerializedError {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export interface SerializedError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

const HTTP_STATUS: Partial<Record<ErrorCode, number>> = {
  AUTH_ERROR: 401,
  AUTHORIZATION_ERROR: 403,
  NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  VERSION_CONFLICT: 409,
  TOOL_UNAVAILABLE: 422,
  MCP_DISCONNECTED: 503,
  MODEL_RATE_LIMIT: 429,
  TIMEOUT: 504,
  CANCELLED: 409,
  JIRA_ERROR: 502,
  INVALID_RESPONSE: 502,
};

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.includes(code);
}

/** Normaliza cualquier error a PlatformError (clasificación conservadora). */
export function toPlatformError(err: unknown): PlatformError {
  if (err instanceof PlatformError) return err;
  const e = err as { name?: string; message?: string; code?: string };
  const msg = e?.message ?? String(err);
  if (e?.name === 'AbortError') return new PlatformError('CANCELLED', 'Operación cancelada');
  if (/timed? ?out|ETIMEDOUT/i.test(msg)) return new PlatformError('TIMEOUT', msg);
  if (/ECONNREFUSED|EPIPE|ECONNRESET|Connection closed|not connected/i.test(msg)) return new PlatformError('MCP_DISCONNECTED', msg);
  if (/rate.?limit|429|overloaded/i.test(msg)) return new PlatformError('MODEL_RATE_LIMIT', msg);
  if (/unauthori[sz]ed|401|not logged in|authentication/i.test(msg)) return new PlatformError('AUTH_ERROR', msg);
  return new PlatformError('INTERNAL', msg);
}

/** Backoff exponencial con jitter, acotado. */
export function backoffDelay(attempt: number, baseMs: number, maxMs = 60_000): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
  const jitter = Math.floor(exp * 0.2 * Math.random());
  return Math.min(maxMs, exp + jitter);
}

export function notFound(what: string): PlatformError {
  return new PlatformError('NOT_FOUND', `${what} no encontrado`);
}

export function invalid(message: string, details?: Record<string, unknown>): PlatformError {
  return new PlatformError('VALIDATION_ERROR', message, details);
}
