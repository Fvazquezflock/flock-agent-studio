import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

export function repoRoot(): string {
  // packages/db/src -> raíz del monorepo
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

/** Carga el .env de la raíz una sola vez sin pisar variables ya definidas en el proceso. */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;
  const file = path.join(repoRoot(), '.env');
  if (!existsSync(file)) return;
  const before = { ...process.env };
  process.loadEnvFile(file);
  for (const [k, v] of Object.entries(before)) process.env[k] = v;
  if (process.env.MAO_USE_TEST_DB === '1' && process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }
}
