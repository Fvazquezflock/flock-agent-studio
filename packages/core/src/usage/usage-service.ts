import type { Core } from '../core';
import { notFound } from '../util/errors';

export interface UsageTotals {
  invocations: number;
  /** Invocaciones cuya respuesta no cumplió el contrato (consumieron tokens igual). */
  failed: number;
  simulated: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  /** Entrada (sin caché + caché escrita + caché leída) + salida. */
  totalTokens: number;
  /** Estimación equivalente API informada por el proveedor; con suscripción de claude.ai no es un cargo. */
  costUsd: number;
}

type Row = {
  outcome: string;
  simulated: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  costUsd: number | null;
};

const empty = (): UsageTotals => ({ invocations: 0, failed: 0, simulated: 0, inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0, totalTokens: 0, costUsd: 0 });

function add(t: UsageTotals, r: Row, count = 1): UsageTotals {
  t.invocations += count;
  if (r.outcome !== 'OK') t.failed += count;
  if (r.simulated) t.simulated += count;
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.cacheCreationInputTokens += r.cacheCreationInputTokens;
  t.cacheReadInputTokens += r.cacheReadInputTokens;
  t.totalTokens += r.inputTokens + r.outputTokens + r.cacheCreationInputTokens + r.cacheReadInputTokens;
  t.costUsd += r.costUsd ?? 0;
  return t;
}

function groupRows<K extends string>(rows: (Row & Record<K, unknown>)[], key: K): (UsageTotals & Record<K, string>)[] {
  const map = new Map<string, UsageTotals>();
  for (const r of rows) {
    const k = String(r[key] ?? '—');
    map.set(k, add(map.get(k) ?? empty(), r));
  }
  return [...map.entries()].map(([k, t]) => ({ [key]: k, ...t }) as UsageTotals & Record<K, string>).sort((a, b) => b.totalTokens - a.totalTokens);
}

/** Consumo de tokens de los modelos, a partir del registro por invocación (ModelInvocation). */
export class UsageService {
  constructor(private readonly core: Core) {}

  private get prisma() {
    return this.core.deps.prisma;
  }

  /** Consumo de una ejecución (incluye intentos fallidos y reintentos): total, por agente y por etapa. */
  async forExecution(idOrNumber: string) {
    const where = /^\d+$/.test(idOrNumber) ? { number: Number(idOrNumber) } : /^EX-\d+$/i.test(idOrNumber) ? { number: Number(idOrNumber.slice(3)) } : { id: idOrNumber };
    const ex = await this.prisma.execution.findFirst({ where, select: { id: true, number: true } });
    if (!ex) throw notFound(`Ejecución ${idOrNumber}`);
    const rows = await this.prisma.modelInvocation.findMany({ where: { executionId: ex.id }, orderBy: { id: 'asc' } });
    return {
      executionId: ex.id,
      number: ex.number,
      totals: rows.reduce((t, r) => add(t, r), empty()),
      byAgent: groupRows(rows, 'agentKey'),
      byStep: groupRows(rows, 'stepKey'),
      models: [...new Set(rows.map((r) => r.model).filter(Boolean))],
    };
  }

  /** Consumo general de los últimos `days` días (opcionalmente de un proyecto): total, por agente, origen y proveedor. */
  async summary(opts: { days?: number; projectKey?: string } = {}) {
    const days = Math.min(Math.max(opts.days ?? 30, 1), 365);
    const since = new Date(Date.now() - days * 86_400_000);
    let projectFilter = {};
    if (opts.projectKey) {
      const project = await this.prisma.project.findUnique({ where: { key: opts.projectKey }, select: { id: true } });
      if (!project) throw notFound(`Proyecto ${opts.projectKey}`);
      projectFilter = { execution: { projectId: project.id } };
    }
    const sums = { inputTokens: true, outputTokens: true, cacheCreationInputTokens: true, cacheReadInputTokens: true, costUsd: true } as const;
    const where = { createdAt: { gte: since }, ...projectFilter };
    const grouped = await this.prisma.modelInvocation.groupBy({ by: ['agentKey', 'origin', 'provider', 'outcome', 'simulated'], where, _sum: sums, _count: { _all: true } });
    const rows = grouped.map((g) => ({
      agentKey: g.agentKey,
      origin: g.origin,
      provider: g.provider,
      outcome: g.outcome,
      simulated: g.simulated,
      count: g._count._all,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
      cacheCreationInputTokens: g._sum.cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: g._sum.cacheReadInputTokens ?? 0,
      costUsd: g._sum.costUsd ?? 0,
    }));
    const fold = <K extends 'agentKey' | 'origin' | 'provider'>(key: K) => {
      const map = new Map<string, UsageTotals>();
      for (const r of rows) map.set(r[key], add(map.get(r[key]) ?? empty(), r, r.count));
      return [...map.entries()].map(([k, t]) => ({ [key]: k, ...t }) as UsageTotals & Record<K, string>).sort((a, b) => b.totalTokens - a.totalTokens);
    };
    const byExecution = await this.prisma.modelInvocation.groupBy({
      by: ['executionId'],
      where: { ...where, executionId: { not: null } },
      _sum: sums,
      _count: { _all: true },
    });
    const top = byExecution
      .map((g) => ({
        executionId: g.executionId!,
        invocations: g._count._all,
        totalTokens: (g._sum.inputTokens ?? 0) + (g._sum.outputTokens ?? 0) + (g._sum.cacheCreationInputTokens ?? 0) + (g._sum.cacheReadInputTokens ?? 0),
        outputTokens: g._sum.outputTokens ?? 0,
        costUsd: g._sum.costUsd ?? 0,
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 10);
    const exs = await this.prisma.execution.findMany({
      where: { id: { in: top.map((t) => t.executionId) } },
      select: { id: true, number: true, status: true, project: { select: { key: true } }, orchestratorVersion: { select: { orchestrator: { select: { key: true } } } } },
    });
    const byId = new Map(exs.map((e) => [e.id, e]));
    return {
      days,
      since: since.toISOString(),
      projectKey: opts.projectKey ?? null,
      totals: rows.reduce((t, r) => add(t, r, r.count), empty()),
      byAgent: fold('agentKey'),
      byOrigin: fold('origin'),
      byProvider: fold('provider'),
      topExecutions: top.map((t) => ({ ...t, number: byId.get(t.executionId)?.number, status: byId.get(t.executionId)?.status, projectKey: byId.get(t.executionId)?.project.key, orchestratorKey: byId.get(t.executionId)?.orchestratorVersion.orchestrator.key })),
    };
  }
}
