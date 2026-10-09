// Copia todos los datos entre dos bases PostgreSQL con el mismo esquema (mismas migraciones aplicadas).
// Uso: node scripts/db-copy.mjs --from <origen> --to <destino> [--dry-run]
//   <origen>/<destino>: `local` (PostgreSQL embebido, base mao, armada con MAO_DB_*) o el NOMBRE de una
//   variable de entorno con la URL (p. ej. DATABASE_URL). Las URLs nunca se pasan por línea de comandos ni se imprimen.
// Ejemplo (local → Railway, con DATABASE_URL apuntando a Railway y migraciones ya aplicadas):
//   node scripts/db-copy.mjs --from local --to DATABASE_URL
// Resguardos: origen y destino distintos, mismas migraciones, destino vacío, una sola transacción (todo o nada).
// Requiere que el usuario del destino pueda fijar session_replication_role (superusuario; en Railway lo es),
// porque el esquema tiene claves foráneas circulares (entidad ↔ versión activa).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function resolveUrl(ref) {
  if (!ref) throw new Error('Uso: node scripts/db-copy.mjs --from <local|VARIABLE> --to <local|VARIABLE> [--dry-run]');
  if (ref === 'local') {
    const user = process.env.MAO_DB_USER || 'mao';
    const pass = encodeURIComponent(process.env.MAO_DB_PASSWORD || 'mao_local_dev');
    return `postgresql://${user}:${pass}@127.0.0.1:${process.env.MAO_DB_PORT || '5433'}/mao?schema=public`;
  }
  const url = process.env[ref];
  if (!url) throw new Error(`La variable ${ref} no está definida (ni en el entorno ni en .env)`);
  return url;
}

/** Traduce una URL estilo Prisma a opciones de `pg` (sslmode con semántica libpq, schema aparte). */
function pgOptions(url) {
  const u = new URL(url);
  const sslmode = u.searchParams.get('sslmode');
  const schema = u.searchParams.get('schema') || 'public';
  const label = `${u.hostname}:${u.port || 5432}/${u.pathname.slice(1)} (schema ${schema})`;
  u.search = '';
  // require = cifrado sin verificar certificado (los proxies de Railway usan certificado autofirmado).
  const ssl = sslmode === 'verify-full' || sslmode === 'verify-ca' ? true : sslmode === 'require' ? { rejectUnauthorized: false } : undefined;
  return { config: { connectionString: u.toString(), ssl, connectionTimeoutMillis: 20_000 }, schema, label };
}

const q = (id) => `"${id.replace(/"/g, '""')}"`;

async function tables(client, schema) {
  const { rows } = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations' ORDER BY 1",
    [schema],
  );
  return rows.map((r) => r.table_name);
}

async function migrations(client, schema) {
  const { rows } = await client.query(`SELECT migration_name FROM ${q(schema)}._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY 1`);
  return rows.map((r) => r.migration_name).join(',');
}

async function main() {
  const { default: pg } = await import('pg');
  const src = pgOptions(resolveUrl(arg('from')));
  const dst = pgOptions(resolveUrl(arg('to')));
  const dryRun = process.argv.includes('--dry-run');
  if (src.label === dst.label) throw new Error('Origen y destino son la misma base');
  console.log(`Origen:  ${src.label}`);
  console.log(`Destino: ${dst.label}`);

  const from = new pg.Client(src.config);
  const to = new pg.Client(dst.config);
  await from.connect();
  await to.connect();
  try {
    const [mFrom, mTo] = await Promise.all([migrations(from, src.schema), migrations(to, dst.schema)]);
    if (mFrom !== mTo) throw new Error('Las migraciones aplicadas difieren: ejecutá `pnpm db:migrate` contra ambas bases antes de copiar');
    const list = await tables(from, src.schema);
    const dstTables = new Set(await tables(to, dst.schema));
    const missing = list.filter((t) => !dstTables.has(t));
    if (missing.length) throw new Error(`Faltan tablas en el destino: ${missing.join(', ')}`);
    for (const t of list) {
      const { rows } = await to.query(`SELECT EXISTS (SELECT 1 FROM ${q(dst.schema)}.${q(t)}) AS has`);
      if (rows[0].has) throw new Error(`El destino no está vacío (${t} tiene filas). Por seguridad no se mezclan datos.`);
    }

    await to.query('BEGIN');
    // Desactiva triggers de claves foráneas solo en esta transacción (FKs circulares entre entidad y versión activa).
    await to.query("SET LOCAL session_replication_role = 'replica'");
    const counts = {};
    for (const t of list) {
      const target = `${q(dst.schema)}.${q(t)}`;
      const { rows } = await from.query(`SELECT row_to_json(r)::text AS j FROM ${q(src.schema)}.${q(t)} r`);
      for (let i = 0; i < rows.length; i += 500) {
        const batch = `[${rows.slice(i, i + 500).map((r) => r.j).join(',')}]`;
        // Ida y vuelta por JSON: conserva jsonb, arrays, enums, BigInt y timestamps sin conversiones en JS.
        await to.query(`INSERT INTO ${target} SELECT * FROM json_populate_recordset(NULL::${target}, $1::json)`, [batch]);
      }
      counts[t] = rows.length;
    }
    // Secuencias de autoincrement (números de ejecución/aprobación, ids de eventos y auditoría).
    const { rows: seqs } = await to.query(
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND column_default LIKE 'nextval(%'",
      [dst.schema],
    );
    for (const s of seqs) {
      const target = `${q(dst.schema)}.${q(s.table_name)}`;
      await to.query(
        `SELECT setval(pg_get_serial_sequence($1, $2), COALESCE((SELECT MAX(${q(s.column_name)}) FROM ${target}), 0) + 1, false)`,
        [`${q(dst.schema)}.${q(s.table_name)}`, s.column_name],
      );
    }
    await to.query(dryRun ? 'ROLLBACK' : 'COMMIT');
    for (const [t, n] of Object.entries(counts)) console.log(`  ${t}: ${n}`);
    console.log(dryRun ? 'Prueba completa (--dry-run): no se guardó nada.' : `Copia completa: ${Object.values(counts).reduce((a, b) => a + b, 0)} filas en ${list.length} tablas.`);
  } catch (err) {
    await to.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await from.end();
    await to.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
