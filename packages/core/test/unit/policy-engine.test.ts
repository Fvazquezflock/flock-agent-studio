import { describe, expect, it } from 'vitest';
import { checkPolicyChange, resolvePolicy, type PolicyRecord } from '../../src/policies/policy-engine';

const p = (x: Partial<PolicyRecord>): PolicyRecord => ({
  id: Math.random().toString(36).slice(2),
  scope: 'GLOBAL',
  projectId: null,
  orchestratorKey: null,
  operationType: 'CREATE_ISSUE',
  mode: 'BATCH_APPROVAL',
  mandatory: false,
  version: 1,
  status: 'ACTIVE',
  ...x,
});

describe('motor de políticas', () => {
  it('aplica valores por defecto seguros sin políticas registradas', () => {
    expect(resolvePolicy([], 'CREATE_ISSUE').mode).toBe('BATCH_APPROVAL');
    expect(resolvePolicy([], 'UPDATE_ISSUE').mode).toBe('ALWAYS_APPROVE');
    expect(resolvePolicy([], 'DELETE_EXTERNAL').mode).toBe('DENIED');
    expect(resolvePolicy([], 'READ_EXTERNAL').mode).toBe('AUTO_APPROVED');
  });

  it('la política más específica gana (operación > proyecto > global)', () => {
    const policies = [
      p({ mode: 'BATCH_APPROVAL' }),
      p({ scope: 'PROJECT', projectId: 'P1', mode: 'ALWAYS_APPROVE' }),
      p({ scope: 'PROJECT', projectId: 'P1', orchestratorKey: 'FLOW', mode: 'AUTO_APPROVED' }),
    ];
    expect(resolvePolicy(policies, 'CREATE_ISSUE', { projectId: 'P1' }).mode).toBe('ALWAYS_APPROVE');
    expect(resolvePolicy(policies, 'CREATE_ISSUE', { projectId: 'P1', orchestratorKey: 'FLOW' }).mode).toBe('AUTO_APPROVED');
    expect(resolvePolicy(policies, 'CREATE_ISSUE', { projectId: 'P2' }).mode).toBe('BATCH_APPROVAL');
  });

  it('una global obligatoria no puede relajarse desde un proyecto', () => {
    const policies = [p({ mode: 'ALWAYS_APPROVE', mandatory: true }), p({ scope: 'PROJECT', projectId: 'P1', mode: 'AUTO_APPROVED' })];
    const r = resolvePolicy(policies, 'CREATE_ISSUE', { projectId: 'P1' });
    expect(r.mode).toBe('ALWAYS_APPROVE');
    expect(r.reasons.join(' ')).toMatch(/obligatoria/);
    expect(checkPolicyChange(policies, { scope: 'PROJECT', operationType: 'CREATE_ISSUE', mode: 'AUTO_APPROVED', mandatory: false })).toMatch(/obligatoria/);
  });

  it('el piso de seguridad del sistema no se puede superar', () => {
    const policies = [p({ operationType: 'DELETE_EXTERNAL', mode: 'AUTO_APPROVED' }), p({ operationType: 'ACTIVATE_SKILL', mode: 'AUTO_APPROVED' })];
    expect(resolvePolicy(policies, 'DELETE_EXTERNAL').mode).toBe('DENIED');
    expect(resolvePolicy(policies, 'ACTIVATE_SKILL').mode).toBe('ALWAYS_APPROVE');
    expect(checkPolicyChange([], { scope: 'GLOBAL', operationType: 'DELETE_EXTERNAL', mode: 'BATCH_APPROVAL', mandatory: false })).toMatch(/piso/);
    expect(checkPolicyChange([], { scope: 'GLOBAL', operationType: 'ACTIVATE_ORCHESTRATOR', mode: 'AUTO_APPROVED', mandatory: false })).toMatch(/piso/);
  });

  it('solo las políticas globales pueden ser obligatorias', () => {
    expect(checkPolicyChange([], { scope: 'PROJECT', operationType: 'CREATE_ISSUE', mode: 'DENIED', mandatory: true })).toMatch(/globales/);
  });

  it('ignora políticas inactivas y usa la última versión', () => {
    const policies = [p({ mode: 'DENIED', status: 'INACTIVE', version: 3 }), p({ mode: 'ALWAYS_APPROVE', version: 2 }), p({ mode: 'BATCH_APPROVAL', version: 1 })];
    expect(resolvePolicy(policies, 'CREATE_ISSUE').mode).toBe('ALWAYS_APPROVE');
  });
});
