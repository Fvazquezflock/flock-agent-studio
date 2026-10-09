import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { disconnectPrisma, loadRootEnv } from '@mao/db';
import { Core } from '@mao/core';

/**
 * Worker local: toma ejecuciones persistidas en PostgreSQL con control de concurrencia.
 * Si el proceso se detiene, los leases vencen y otra instancia (o este worker al reiniciar) las retoma.
 */
loadRootEnv();
const core = new Core();
const prisma = core.deps.prisma;
const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString('hex')}`;
const concurrency = Math.max(1, Number(process.env.MAO_WORKER_CONCURRENCY || 2));
const pollMs = Math.max(250, Number(process.env.MAO_WORKER_POLL_MS || 1000));
const running = new Set<Promise<void>>();
const startedAt = new Date();
let stopping = false;

async function beat() {
  await prisma.workerHeartbeat.upsert({
    where: { workerId },
    create: { workerId, pid: process.pid, host: hostname(), startedAt, seenAt: new Date(), running: running.size, info: { concurrency, pollMs } },
    update: { seenAt: new Date(), running: running.size },
  });
}

async function loop() {
  while (!stopping) {
    try {
      const free = concurrency - running.size;
      if (free > 0) {
        const ids = await core.engine.claim(workerId, free);
        for (const id of ids) {
          console.log(`[worker] procesando ${id}`);
          const p = core.engine.runExecution(id, workerId).catch((e) => console.error(`[worker] error en ${id}:`, e)).finally(() => running.delete(p));
          running.add(p);
        }
      }
    } catch (err) {
      console.error('[worker] error al tomar ejecuciones:', err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

const heartbeat = setInterval(() => beat().catch(() => {}), 5_000);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('[worker] deteniendo: esperando ejecuciones en curso (máx. 30 s)…');
  clearInterval(heartbeat);
  await Promise.race([Promise.allSettled([...running]), new Promise((r) => setTimeout(r, 30_000))]);
  await prisma.workerHeartbeat.delete({ where: { workerId } }).catch(() => {});
  await core.close();
  await disconnectPrisma();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await beat();
console.log(`[worker] ${workerId} iniciado (concurrencia ${concurrency}, sondeo ${pollMs} ms)`);
await loop();
