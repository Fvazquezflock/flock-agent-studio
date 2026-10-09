import type { Prisma } from '@mao/db';
import { sanitize } from '../util/sanitize';

export type EventLevel = 'info' | 'warn' | 'error' | 'success';

/** Evento de ejecución persistido (fuente de la UI en vivo vía SSE y de la CLI). */
export async function emitEvent(
  db: Prisma.TransactionClient | { executionEvent: Prisma.TransactionClient['executionEvent'] },
  executionId: string,
  type: string,
  message: string,
  opts: { stepKey?: string | null; level?: EventLevel; data?: unknown } = {},
): Promise<void> {
  await db.executionEvent.create({
    data: {
      executionId,
      type,
      message,
      stepKey: opts.stepKey ?? null,
      level: opts.level ?? 'info',
      data: opts.data === undefined ? undefined : (sanitize(opts.data) as Prisma.InputJsonValue),
    },
  });
}
