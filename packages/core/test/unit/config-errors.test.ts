import { globalConfigSchema } from '@mao/shared';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from '../../src/config/config-service';
import { backoffDelay, isRetryable, PlatformError, toPlatformError } from '../../src/util/errors';
import { contentHash, stableStringify } from '../../src/util/hash';
import { sanitize } from '../../src/util/sanitize';
import { diffLines } from '../../src/util/diff';

describe('herencia de configuración global → proyecto → operación', () => {
  const global = globalConfigSchema.parse({ defaults: { technologies: ['Java'], templates: { minAcceptanceCriteria: 3 } } });

  it('el proyecto especializa la global', () => {
    const { config } = resolveConfig(global, { technologies: ['React'], jira: { issueTypes: { story: 'Feature' } } });
    expect(config.technologies).toEqual(['React']);
    expect(config.templates.minAcceptanceCriteria).toBe(3);
    expect(config.jira.issueTypes.story).toBe('Feature');
    expect(config.jira.issueTypes.epic).toBe('Epic');
  });

  it('una operación solo puede especializar claves permitidas', () => {
    const { config, ignored } = resolveConfig(global, {}, { templates: { minAcceptanceCriteria: 5 }, jira: { taskHierarchy: 'link' }, security: {} } as Record<string, unknown>);
    expect(config.templates.minAcceptanceCriteria).toBe(5);
    expect(config.jira.taskHierarchy).toBe('subtask');
    expect(ignored).toEqual(['jira', 'security']);
  });

  it('las reglas de seguridad obligatorias no admiten otros valores', () => {
    expect(() => globalConfigSchema.parse({ security: { mandatory: { allowDeleteExternal: true } } })).toThrow();
  });
});

describe('errores, reintentos y utilidades', () => {
  it('clasifica errores y decide reintentos', () => {
    expect(toPlatformError(new Error('connect ECONNREFUSED 127.0.0.1')).code).toBe('MCP_DISCONNECTED');
    expect(toPlatformError(new Error('Request timed out')).code).toBe('TIMEOUT');
    expect(toPlatformError(new Error('429 rate limit')).code).toBe('MODEL_RATE_LIMIT');
    expect(toPlatformError(new Error('Not logged in · Please run /login')).code).toBe('AUTH_ERROR');
    expect(isRetryable('MCP_DISCONNECTED')).toBe(true);
    expect(isRetryable('AUTHORIZATION_ERROR')).toBe(false);
    expect(isRetryable('VERSION_CONFLICT')).toBe(false);
    expect(new PlatformError('NOT_FOUND', 'x').httpStatus).toBe(404);
  });

  it('el backoff crece y está acotado', () => {
    expect(backoffDelay(1, 1000)).toBeGreaterThanOrEqual(1000);
    expect(backoffDelay(3, 1000)).toBeGreaterThanOrEqual(4000);
    expect(backoffDelay(30, 1000, 60_000)).toBeLessThanOrEqual(60_000);
  });

  it('el hash es estable ante el orden de claves', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
    expect(contentHash({ x: 1, y: 2 })).toBe(contentHash({ y: 2, x: 1 }));
  });

  it('sanitiza secretos en registros', () => {
    const s = sanitize({ apiKey: 'sk-ant-api03-abcdefghijklmnop', nested: { password: 'x', note: 'Bearer abcdefghijklmnopqrstuvwxyz' }, ok: 'visible' });
    expect(s.apiKey).toBe('[REDACTADO]');
    expect(s.nested.password).toBe('[REDACTADO]');
    expect(s.nested.note).toContain('[REDACTADO]');
    expect(s.ok).toBe('visible');
  });

  it('diff por líneas', () => {
    const d = diffLines('a\nb\nc', 'a\nx\nc');
    expect(d.map((l) => l.type)).toEqual(['same', 'del', 'add', 'same']);
  });
});
