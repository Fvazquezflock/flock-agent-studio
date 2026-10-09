import { describe, expect, it } from 'vitest';
import { databaseLabel, describeDatabaseUrl } from '../../src/database';

describe('descripción de la base de datos', () => {
  it('distingue loopback de remota y nunca expone credenciales', () => {
    const local = describeDatabaseUrl('postgresql://mao:secreto@127.0.0.1:5433/mao?schema=public')!;
    expect(local).toMatchObject({ host: '127.0.0.1', port: 5433, database: 'mao', remote: false, sslmode: null });

    const remote = describeDatabaseUrl('postgresql://postgres:clave@ejemplo.proxy.rlwy.net:12345/railway?schema=public&sslmode=require')!;
    expect(remote).toMatchObject({ host: 'ejemplo.proxy.rlwy.net', port: 12345, database: 'railway', remote: true, sslmode: 'require' });
    expect(databaseLabel(remote)).toBe('ejemplo.proxy.rlwy.net:12345/railway');
    expect(JSON.stringify(remote)).not.toContain('clave');
  });

  it('devuelve null ante URLs vacías o de otro protocolo', () => {
    expect(describeDatabaseUrl(undefined)).toBeNull();
    expect(describeDatabaseUrl('no es una url')).toBeNull();
    expect(describeDatabaseUrl('mysql://u:p@host/db')).toBeNull();
  });
});
