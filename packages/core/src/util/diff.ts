import { stableStringify } from './hash';

export interface DiffLine {
  type: 'same' | 'add' | 'del';
  text: string;
}

/** Diff por líneas (LCS). Suficiente para prompts, definiciones y descripciones de issues. */
export function diffLines(a: string, b: string): DiffLine[] {
  const x = a.split(/\r?\n/);
  const y = b.split(/\r?\n/);
  const n = x.length;
  const m = y.length;
  if (n * m > 4_000_000) {
    return [...x.map((t) => ({ type: 'del' as const, text: t })), ...y.map((t) => ({ type: 'add' as const, text: t }))];
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) {
      out.push({ type: 'same', text: x[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: x[i++] });
    } else {
      out.push({ type: 'add', text: y[j++] });
    }
  }
  while (i < n) out.push({ type: 'del', text: x[i++] });
  while (j < m) out.push({ type: 'add', text: y[j++] });
  return out;
}

/** Diff de dos definiciones JSON (formateadas con claves ordenadas). */
export function diffJson(a: unknown, b: unknown): DiffLine[] {
  const fmt = (v: unknown) => JSON.stringify(JSON.parse(stableStringify(v ?? {})), null, 2);
  return diffLines(fmt(a), fmt(b));
}
