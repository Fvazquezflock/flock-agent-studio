import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Recrea la base mao_test desde cero (migraciones reales) antes de la suite de integración. */
export default async function setup() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
  const envFile = path.join(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/mao_test/.test(url)) throw new Error('TEST_DATABASE_URL debe apuntar a la base mao_test');
  // La suite borra el esquema: una base remota (p. ej. Railway) solo con habilitación explícita.
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(new URL(url).hostname) && process.env.MAO_ALLOW_REMOTE_TEST_DB !== '1') {
    throw new Error('TEST_DATABASE_URL apunta a una base remota: las pruebas usan mao_test local (pnpm db:start). Para forzarlo: MAO_ALLOW_REMOTE_TEST_DB=1');
  }
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url.replace(/\?.*$/, '') });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await client.end();
  const r = spawnSync(process.execPath, [path.join(root, 'packages', 'db', 'scripts', 'prisma.mjs'), 'migrate', 'deploy'], {
    env: { ...process.env, MAO_USE_TEST_DB: '1' },
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`migrate deploy falló:\n${r.stdout}\n${r.stderr}`);
}
