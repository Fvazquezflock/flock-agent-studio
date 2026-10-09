'use client';

import { Fragment, type ReactNode } from 'react';
import { cx } from './core';

/** JSON legible (monoespaciado, superficie hundida). */
export function JsonView({ value, maxHeight = 420 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre className="fk-mono rounded-md border border-border bg-surface-subtle p-3 text-ink" style={{ maxHeight, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 12, lineHeight: '18px', margin: 0 }}>
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Diff por líneas (LCS) para comparar texto original y propuesto en el navegador. */
export function diffText(a: string, b: string): DiffLine[] {
  const x = (a ?? '').split(/\r?\n/);
  const y = (b ?? '').split(/\r?\n/);
  const n = x.length;
  const m = y.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ type: 'same', text: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'del', text: x[i++] });
    else out.push({ type: 'add', text: y[j++] });
  }
  while (i < n) out.push({ type: 'del', text: x[i++] });
  while (j < m) out.push({ type: 'add', text: y[j++] });
  return out;
}

export function DiffView({ lines, maxHeight = 420 }: { lines: DiffLine[]; maxHeight?: number }) {
  return (
    <div className="fk-mono overflow-auto rounded-md border border-border" style={{ maxHeight, fontSize: 12, lineHeight: '18px' }} role="table" aria-label="Diferencias">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cx('flex gap-2 px-3', l.type === 'add' && 'bg-success-subtle text-success', l.type === 'del' && 'bg-danger-subtle text-danger', l.type === 'same' && 'text-ink-muted')}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          <span aria-label={l.type === 'add' ? 'agregado' : l.type === 'del' ? 'eliminado' : 'sin cambios'} style={{ width: 12, flex: 'none' }}>
            {l.type === 'add' ? '+' : l.type === 'del' ? '−' : ' '}
          </span>
          <span>{l.text || ' '}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Markdown seguro (sin HTML crudo) ----------

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (t.startsWith('**')) out.push(<strong key={`${keyBase}-${k++}`}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={`${keyBase}-${k++}`} className="fk-mono rounded-sm bg-surface-subtle px-1">{t.slice(1, -1)}</code>);
    else out.push(<em key={`${keyBase}-${k++}`}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: ReactNode[] = [];
  const lines = (text ?? '').split(/\r?\n/);
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push(
        <pre key={k++} className="fk-mono rounded-md bg-surface-subtle p-3" style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: '8px 0' }}>
          {code.join('\n')}
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const cls = level === 1 ? 'fk-h2' : level === 2 ? 'fk-h3' : 'fk-h4';
      blocks.push(
        <div key={k++} className={cls} style={{ margin: '14px 0 6px' }} role="heading" aria-level={Math.min(level + 1, 6)}>
          {inline(h[2], `h${k}`)}
        </div>,
      );
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List key={k++} className={ordered ? 'list-decimal' : 'list-disc'} style={{ paddingLeft: 22, margin: '6px 0' }}>
          {items.map((it, j) => (
            <li key={j}>{inline(it.replace(/^\[ \]\s*/, '☐ '), `l${k}-${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*([-*]|\d+\.)\s+)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={k++} style={{ margin: '6px 0' }}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `p${k}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className={cx('fk-text', className)}>{blocks}</div>;
}

// ---------- Visualización del flujo (DAG) ----------

export interface FlowNode {
  key: string;
  name: string;
  handler: string;
  agentKey?: string | null;
  dependsOn: string[];
  status?: string;
}

const HANDLER_ICON: Record<string, string> = { 'jira.context': 'search', 'agent.task': 'users', 'approval.gate': 'shield', 'jira.publish': 'send', 'supervisor.review': 'sparkles' };
const STATUS_STYLE: Record<string, { stroke: string; fill: string; text: string }> = {
  COMPLETED: { stroke: 'var(--success)', fill: 'var(--success-subtle)', text: 'var(--ink)' },
  RUNNING: { stroke: 'var(--primary)', fill: 'var(--primary-subtle)', text: 'var(--ink)' },
  WAITING_APPROVAL: { stroke: 'var(--warning)', fill: 'var(--warning-subtle)', text: 'var(--ink)' },
  RETRYING: { stroke: 'var(--warning)', fill: 'var(--warning-subtle)', text: 'var(--ink)' },
  FAILED: { stroke: 'var(--danger)', fill: 'var(--danger-subtle)', text: 'var(--ink)' },
  CANCELLED: { stroke: 'var(--border-strong)', fill: 'var(--surface-subtle)', text: 'var(--ink-muted)' },
  SKIPPED: { stroke: 'var(--border-strong)', fill: 'var(--surface-subtle)', text: 'var(--ink-muted)' },
};

function layers(nodes: FlowNode[]): string[][] {
  const keys = new Set(nodes.map((n) => n.key));
  const indeg = new Map(nodes.map((n) => [n.key, n.dependsOn.filter((d) => keys.has(d)).length]));
  const out: string[][] = [];
  let frontier = nodes.filter((n) => indeg.get(n.key) === 0).map((n) => n.key);
  const seen = new Set<string>();
  while (frontier.length) {
    out.push(frontier);
    frontier.forEach((k) => seen.add(k));
    const next: string[] = [];
    for (const n of nodes) {
      if (seen.has(n.key) || next.includes(n.key)) continue;
      if (n.dependsOn.filter((d) => keys.has(d)).every((d) => seen.has(d))) next.push(n.key);
    }
    frontier = next;
  }
  const rest = nodes.filter((n) => !seen.has(n.key)).map((n) => n.key);
  if (rest.length) out.push(rest); // ciclo: se muestran al final
  return out;
}

/** Diagrama vertical por capas: lo que está en la misma fila puede correr en paralelo. */
export function FlowGraph({ nodes, onSelect, selected }: { nodes: FlowNode[]; onSelect?: (key: string) => void; selected?: string }) {
  const W = 200;
  const H = 56;
  const GX = 24;
  const GY = 34;
  const ls = layers(nodes);
  const maxCols = Math.max(1, ...ls.map((l) => l.length));
  const width = maxCols * W + (maxCols - 1) * GX + 20;
  const height = ls.length * H + (ls.length - 1) * GY + 20;
  const pos = new Map<string, { x: number; y: number }>();
  ls.forEach((layer, li) => {
    const rowW = layer.length * W + (layer.length - 1) * GX;
    const x0 = (width - rowW) / 2;
    layer.forEach((k, ci) => pos.set(k, { x: x0 + ci * (W + GX), y: 10 + li * (H + GY) }));
  });
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  return (
    <div className="overflow-x-auto">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Diagrama del flujo del orquestador" style={{ display: 'block', margin: '0 auto' }}>
        <defs>
          <marker id="fk-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: 'var(--border-strong)' }} />
          </marker>
        </defs>
        {nodes.flatMap((n) =>
          n.dependsOn
            .filter((d) => pos.has(d))
            .map((d) => {
              const a = pos.get(d)!;
              const b = pos.get(n.key)!;
              const x1 = a.x + W / 2;
              const y1 = a.y + H;
              const x2 = b.x + W / 2;
              const y2 = b.y;
              const my = (y1 + y2) / 2;
              return <path key={`${d}-${n.key}`} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2 - 2}`} fill="none" style={{ stroke: 'var(--border-strong)' }} strokeWidth={1.5} markerEnd="url(#fk-arrow)" />;
            }),
        )}
        {[...pos.entries()].map(([k, p]) => {
          const n = byKey.get(k)!;
          const st = STATUS_STYLE[n.status ?? ''] ?? { stroke: 'var(--border-strong)', fill: 'var(--surface)', text: 'var(--ink)' };
          const sel = selected === k;
          return (
            <g key={k} transform={`translate(${p.x},${p.y})`} style={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={() => onSelect?.(k)} role={onSelect ? 'button' : undefined} aria-label={`${n.name}${n.status ? `: ${n.status}` : ''}`} tabIndex={onSelect ? 0 : undefined} onKeyDown={(e) => e.key === 'Enter' && onSelect?.(k)}>
              <rect width={W} height={H} rx={12} style={{ fill: st.fill, stroke: sel ? 'var(--focus)' : st.stroke }} strokeWidth={sel ? 2.5 : 1.5} />
              <text x={14} y={23} style={{ fill: st.text, fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                {n.name.length > 24 ? `${n.name.slice(0, 23)}…` : n.name}
              </text>
              <text x={14} y={42} style={{ fill: 'var(--ink-muted)', fontSize: 11, fontFamily: 'var(--font-sans)' }}>
                {(n.agentKey ?? n.handler).slice(0, 26)}
                {n.status ? ` · ${n.status === 'WAITING_APPROVAL' ? 'ESPERA' : n.status}` : ''}
              </text>
              <title>{`${n.name} (${n.handler}${n.agentKey ? `, ${n.agentKey}` : ''})`}</title>
              {HANDLER_ICON[n.handler] && <circle cx={W - 16} cy={16} r={4} style={{ fill: st.stroke }} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
