/** Utilidades de texto para el proveedor simulado (heurísticas determinísticas, sin aleatoriedad). */

const STOP = new Set(
  'de la el los las un una unos unas y o en con por para del al que se su sus es son como cuando entonces dado debe deben puede pueden hasta sin más mas ya lo le les mi tu nuestro este esta estos estas ese esa otro otra cada todo toda todos todas desde sobre entre no si ser estar hay tiene tener antes después'.split(
    ' ',
  ),
);

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Raíz muy simple para comparar variantes (reservar/reserva/reservas). */
function stem(w: string): string {
  return w.length > 5 ? w.slice(0, 5) : w;
}

export function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(' ')
      .filter((w) => w.length > 2 && !STOP.has(w))
      .map(stem),
  );
}

export function similarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / Math.min(x.size, y.size);
}

/** Jaccard sobre tokens: más estricto que `similarity` para títulos cortos. */
export function jaccard(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter / (x.size + y.size - inter);
}

/** Misma capacidad: mismo verbo principal y vocabulario similar. */
export function sameCapability(a: string, b: string): boolean {
  const va = normalize(a).split(' ')[0]?.slice(0, 5);
  const vb = normalize(b).split(' ')[0]?.slice(0, 5);
  return !!va && va === vb && jaccard(a, b) >= 0.4;
}

export function overlap(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  let inter = 0;
  for (const t of x) if (y.has(t)) inter++;
  return inter;
}

export interface Section {
  heading: string;
  lines: string[];
  bullets: string[];
}

/** Divide un texto Markdown en secciones por encabezados (## o líneas terminadas en ":"). */
export function sections(text: string): Section[] {
  const out: Section[] = [{ heading: '', lines: [], bullets: [] }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const h = /^#{1,6}\s+(.+)$/.exec(line) ?? (/^([A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,40}):$/.exec(line) as RegExpExecArray | null);
    if (h) {
      out.push({ heading: h[1].trim(), lines: [], bullets: [] });
      continue;
    }
    if (!line) continue;
    const cur = out[out.length - 1];
    const b = /^[-*•]\s+(.+)$/.exec(line);
    if (b) cur.bullets.push(b[1].trim());
    else cur.lines.push(line);
  }
  return out.filter((s) => s.heading || s.lines.length || s.bullets.length);
}

export function findSection(secs: Section[], ...keywords: string[]): Section | undefined {
  return secs.find((s) => keywords.some((k) => normalize(s.heading).includes(k)));
}

export const VAGUE_TERMS: { re: RegExp; term: string; question: string }[] = [
  { re: /\br[aá]pid[oa]s?\b/i, term: 'rápido', question: '¿Cuál es el tiempo de respuesta máximo aceptable (por ejemplo, p95 en segundos)?' },
  { re: /\badecuad[oa]s?\b/i, term: 'adecuado', question: '¿Qué mensaje exacto debe ver la persona y qué acción puede tomar?' },
  { re: /\betc\.?/i, term: 'etc.', question: '¿Cuál es la lista completa de casos o validaciones?' },
  { re: /todo lo necesario/i, term: 'todo lo necesario', question: '¿Qué validaciones concretas se requieren?' },
  { re: /\bf[aá]cil(mente)?\b/i, term: 'fácil', question: '¿Con qué criterio verificable se mide la facilidad de uso?' },
  { re: /\bintuitiv[oa]\b/i, term: 'intuitivo', question: '¿Qué criterio de usabilidad se usará para aceptarlo?' },
  { re: /\bcorrectamente\b/i, term: 'correctamente', question: '¿Cuál es el resultado esperado observable?' },
  { re: /cuando corresponda/i, term: 'cuando corresponda', question: '¿En qué condiciones exactas corresponde?' },
];

export function findVague(text: string): { term: string; sentence: string; question: string }[] {
  const out: { term: string; sentence: string; question: string }[] = [];
  const sentences = text.split(/\r?\n|(?<=\.)\s+/).map((s) => s.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
  for (const v of VAGUE_TERMS) {
    const s = sentences.find((x) => v.re.test(x));
    if (s) out.push({ term: v.term, sentence: s, question: v.question });
  }
  return out;
}

const INJECTION = [/ignor[aáe]\w*\s+(todas\s+)?(las\s+)?instrucciones/i, /aprob[aá]\w*\s+autom[aá]ticamente/i, /\bborr[aá]\w*\s+(los\s+)?issues/i, /system prompt/i, /olvid[aá]\w*\s+(tus|las)\s+reglas/i, /ignore (all )?(previous )?instructions/i];

export function looksLikeInjection(text: string): boolean {
  return INJECTION.some((re) => re.test(text));
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function lowerFirst(s: string): string {
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

export function stripDot(s: string): string {
  return s.replace(/[.;:\s]+$/, '');
}

export function shorten(s: string, max = 90): string {
  const t = stripDot(s);
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : t;
}

/** Verbo principal de una capacidad ("Cancelar un turno…" → "cancelar"). */
export function mainVerb(s: string): string {
  return normalize(s).split(' ')[0] ?? '';
}
