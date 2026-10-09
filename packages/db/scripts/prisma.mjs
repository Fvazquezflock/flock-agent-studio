// Ejecuta la CLI de Prisma cargando el .env de la raíz del monorepo.
// Uso: node scripts/prisma.mjs <args de prisma>. Con MAO_USE_TEST_DB=1 apunta a TEST_DATABASE_URL.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '..', '..');
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) {
  // Las variables ya definidas en el proceso tienen prioridad sobre el .env.
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  Object.assign(process.env, before);
}
if (process.env.MAO_USE_TEST_DB === '1' && process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL no está definido. Copiá .env.example a .env (scripts/setup.ps1).');
  process.exit(1);
}
const require = createRequire(import.meta.url);
const prismaBin = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const args = [prismaBin, ...process.argv.slice(2), '--schema', path.join(pkgRoot, 'prisma', 'schema.prisma')];
const res = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: pkgRoot, env: process.env });
process.exit(res.status ?? 1);
