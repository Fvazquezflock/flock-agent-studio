'use client';

import { fmtNumber } from '@mao/shared';
import { DataTable, DescriptionList } from '@/components/ui/containers';
import { Tag } from '@/components/ui/feedback';

export interface UsageTotals {
  invocations: number;
  failed: number;
  simulated: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export const ORIGIN_LABEL: Record<string, string> = {
  EXECUTION: 'Ejecuciones',
  SUPERVISOR_PLAN: 'Planificación del supervisor',
  CATALOG_TEST: 'Pruebas de catálogo',
};

export const PROVIDER_LABEL: Record<string, string> = {
  MOCK: 'Simulado',
  LOCAL_CLAUDE: 'Claude Code local',
  ANTHROPIC_API: 'API de Anthropic',
};

export const tokens = (n: number | undefined) => fmtNumber(n ?? 0);
export const usd = (n: number | undefined) => `USD ${fmtNumber(n ?? 0, 2)}`;

/** Aclaración del costo: es la estimación que informa el proveedor, no necesariamente un cargo. */
export const COST_NOTE =
  'Costo estimado = equivalente a precio de API informado por el proveedor. Con Claude Code y sesión de claude.ai (suscripción) no es un cargo: consume el uso incluido en el plan.';

export function UsageTotalsList({ t, columns = 4 }: { t: UsageTotals; columns?: 1 | 2 | 3 | 4 }) {
  return (
    <DescriptionList
      columns={columns}
      items={[
        { label: 'Tokens totales', value: <span className="fk-num">{tokens(t.totalTokens)}</span> },
        { label: 'Salida', value: <span className="fk-num">{tokens(t.outputTokens)}</span> },
        { label: 'Entrada (sin caché)', value: <span className="fk-num">{tokens(t.inputTokens)}</span> },
        { label: 'Caché escrita / leída', value: <span className="fk-num">{`${tokens(t.cacheCreationInputTokens)} / ${tokens(t.cacheReadInputTokens)}`}</span> },
        { label: 'Invocaciones', value: <span className="fk-num">{`${t.invocations}${t.failed ? ` (${t.failed} fuera de contrato)` : ''}`}</span> },
        { label: 'Costo estimado', value: <span className="fk-num">{usd(t.costUsd)}</span> },
      ]}
    />
  );
}

/** Tabla de consumo agrupada (por agente, etapa, origen o proveedor). */
export function UsageTable<K extends string>({ rows, groupKey, groupLabel, render }: { rows: (UsageTotals & Record<K, string>)[]; groupKey: K; groupLabel: string; render?: (v: string) => React.ReactNode }) {
  return (
    <DataTable
      compact
      rowKey={groupKey}
      rows={rows as any[]}
      columns={[
        {
          key: groupKey,
          header: groupLabel,
          render: (r: any) => (
            <span className="inline-flex items-center gap-2">
              {render ? render(r[groupKey]) : r[groupKey]}
              {r.simulated === r.invocations && r.invocations > 0 ? <Tag size="sm">Simulado</Tag> : null}
            </span>
          ),
        },
        { key: 'invocations', header: 'Invocaciones', align: 'right', render: (r: UsageTotals) => `${r.invocations}${r.failed ? ` (${r.failed} inválida${r.failed > 1 ? 's' : ''})` : ''}` },
        { key: 'inputTokens', header: 'Entrada', align: 'right', render: (r: UsageTotals) => <span className="fk-num">{tokens(r.inputTokens)}</span> },
        { key: 'cache', header: 'Caché escr. / leída', align: 'right', render: (r: UsageTotals) => <span className="fk-num">{`${tokens(r.cacheCreationInputTokens)} / ${tokens(r.cacheReadInputTokens)}`}</span> },
        { key: 'outputTokens', header: 'Salida', align: 'right', render: (r: UsageTotals) => <span className="fk-num">{tokens(r.outputTokens)}</span> },
        { key: 'totalTokens', header: 'Total', align: 'right', render: (r: UsageTotals) => <b className="fk-num">{tokens(r.totalTokens)}</b> },
        { key: 'costUsd', header: 'Costo est.', align: 'right', render: (r: UsageTotals) => <span className="fk-num">{usd(r.costUsd)}</span> },
      ]}
    />
  );
}
