// Arranca Next.js cargando el .env de la raíz y escuchando solo en loopback.
// Uso: node scripts/next.mjs dev|build|start
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(webDir, '..', '..');
const envFile = path.join(repo, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
process.env.NEXT_TELEMETRY_DISABLED = '1';

const cmd = process.argv[2] ?? 'dev';
if (cmd === 'dev' || cmd === 'build') {
  const r = spawnSync(process.execPath, [path.join(repo, 'design-system', 'scripts', 'build-tokens.mjs')], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const port = process.env.MAO_WEB_PORT || '3000';
const args = cmd === 'build' ? ['build'] : [cmd, '-H', '127.0.0.1', '-p', port];
const child = spawn(process.execPath, [nextBin, ...args], { stdio: 'inherit', cwd: webDir, env: process.env });
child.on('exit', (code) => process.exit(code ?? 0));
