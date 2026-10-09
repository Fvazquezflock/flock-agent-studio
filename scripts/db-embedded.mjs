// PostgreSQL embebido para Windows sin Docker (binarios oficiales empaquetados por embedded-postgres).
// Escucha solo en 127.0.0.1. Uso: node scripts/db-embedded.mjs start|start-if-local|stop|status|ensure-dbs
//   start-if-local: inicia solo si DATABASE_URL apunta a loopback (con una base remota como Railway no hace falta
//   para los servicios; las pruebas de integración siguen usando mao_test local: `pnpm db:start`).
// Con Docker disponible se puede usar `docker compose up -d` en su lugar (mismo puerto y credenciales).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const PORT = process.env.MAO_DB_PORT || '5433';
const USER = process.env.MAO_DB_USER || 'mao';
const PASSWORD = process.env.MAO_DB_PASSWORD || 'mao_local_dev';
const DATA = path.join(root, '.data', 'postgres');
const LOG = path.join(root, '.data', 'postgres.log');

/** Host de DATABASE_URL si es remoto (sin credenciales); null si es loopback o no está definido. */
function remoteWorkHost() {
  try {
    const u = new URL(process.env.DATABASE_URL || '');
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(u.hostname) ? null : u.host;
  } catch {
    return null;
  }
}

async function bins() {
  if (process.platform !== 'win32') {
    throw new Error('Este script está pensado para Windows. En otros sistemas usá `docker compose up -d`.');
  }
  return import('@embedded-postgres/windows-x64');
}

function run(bin, args, opts = {}) {
  const res = spawnSync(bin, args, { encoding: 'utf8', windowsHide: true, ...opts });
  return { code: res.status ?? 1, out: `${res.stdout || ''}${res.stderr || ''}`.trim() };
}

async function init() {
  if (existsSync(path.join(DATA, 'PG_VERSION'))) return false;
  const { initdb } = await bins();
  mkdirSync(path.dirname(DATA), { recursive: true });
  const pw = path.join(os.tmpdir(), `mao-pw-${process.pid}`);
  writeFileSync(pw, PASSWORD, { encoding: 'utf8', mode: 0o600 });
  try {
    const r = run(initdb, ['-D', DATA, '-U', USER, `--pwfile=${pw}`, '--auth=scram-sha-256', '-E', 'UTF8', '--no-locale']);
    if (r.code !== 0) throw new Error(`initdb falló:\n${r.out}`);
  } finally {
    rmSync(pw, { force: true });
  }
  return true;
}

async function status() {
  const { pg_ctl } = await bins();
  if (!existsSync(path.join(DATA, 'PG_VERSION'))) return { running: false, initialized: false };
  const r = run(pg_ctl, ['-D', DATA, 'status']);
  return { running: r.code === 0, initialized: true, detail: r.out };
}

async function ensureDatabases() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ host: '127.0.0.1', port: Number(PORT), user: USER, password: PASSWORD, database: 'postgres' });
  await client.connect();
  try {
    for (const db of ['mao', 'mao_test']) {
      const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
      if (!rowCount) {
        await client.query(`CREATE DATABASE "${db}"`);
        console.log(`Base de datos creada: ${db}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function start() {
  const created = await init();
  if (created) console.log(`Clúster inicializado en ${DATA}`);
  const st = await status();
  if (st.running) {
    console.log(`PostgreSQL ya está corriendo en 127.0.0.1:${PORT}`);
  } else {
    const { pg_ctl } = await bins();
    // stdio 'ignore': postgres hereda los handles de pg_ctl; con pipes el proceso padre esperaría para siempre.
    const r = run(pg_ctl, ['-D', DATA, '-l', LOG, '-o', `-p ${PORT} -c listen_addresses=127.0.0.1`, '-w', '-t', '60', 'start'], { stdio: 'ignore' });
    if (r.code !== 0) throw new Error(`No se pudo iniciar PostgreSQL:\n${r.out}\nRevisá ${LOG}`);
    console.log(`PostgreSQL iniciado en 127.0.0.1:${PORT} (log: ${LOG})`);
  }
  await ensureDatabases();
}

async function stop() {
  const st = await status();
  if (!st.running) {
    console.log('PostgreSQL no está corriendo.');
    return;
  }
  const { pg_ctl } = await bins();
  const r = run(pg_ctl, ['-D', DATA, '-m', 'fast', '-w', 'stop']);
  if (r.code !== 0) throw new Error(`No se pudo detener PostgreSQL:\n${r.out}`);
  console.log('PostgreSQL detenido.');
}

const cmd = process.argv[2] || 'status';
try {
  if (cmd === 'start') await start();
  else if (cmd === 'start-if-local') {
    const remote = remoteWorkHost();
    if (remote) console.log(`Base de trabajo remota (${remote}): no se inicia PostgreSQL embebido. Para pruebas: pnpm db:start`);
    else await start();
  }
  else if (cmd === 'stop') await stop();
  else if (cmd === 'ensure-dbs') await ensureDatabases();
  else if (cmd === 'status') {
    const st = await status();
    console.log(st.running ? `Disponible: PostgreSQL en 127.0.0.1:${PORT}` : st.initialized ? 'Detenido (clúster inicializado)' : 'No inicializado');
    process.exitCode = st.running ? 0 : 3;
  } else {
    console.error('Uso: node scripts/db-embedded.mjs start|start-if-local|stop|status|ensure-dbs');
    process.exitCode = 2;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
