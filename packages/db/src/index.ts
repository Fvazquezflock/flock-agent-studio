import { PrismaClient } from '@prisma/client';
import { loadRootEnv } from './env';

export * from '@prisma/client';
export { loadRootEnv } from './env';

let client: PrismaClient | undefined;

function envMs(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Cliente Prisma compartido por proceso (API, worker, seed, tests).
 * Los timeouts de transacción contemplan una base remota (p. ej. Railway, ~150 ms por consulta):
 * con los valores por defecto de Prisma (5 s) una aprobación en lote de varios ítems se cortaría.
 */
export function getPrisma(): PrismaClient {
  if (!client) {
    loadRootEnv();
    client = new PrismaClient({
      log: process.env.MAO_PRISMA_LOG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
      transactionOptions: {
        maxWait: envMs('MAO_DB_TX_MAX_WAIT_MS', 10_000),
        timeout: envMs('MAO_DB_TX_TIMEOUT_MS', 60_000),
      },
    });
  }
  return client;
}

export async function disconnectPrisma(): Promise<void> {
  if (client) {
    await client.$disconnect();
    client = undefined;
  }
}

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
