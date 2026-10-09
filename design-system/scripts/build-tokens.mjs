// Genera los estilos de la UI desde el design system Flock IT (tokens.json es la fuente de verdad).
// Salida: apps/web/styles/tokens.css (variables por tema + clases tipográficas) y apps/web/styles/flock-ui.css (bundle.css).
// Uso: node design-system/scripts/build-tokens.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(dsDir, '..');
const outDir = path.join(repo, 'apps', 'web', 'styles');
const tokens = JSON.parse(readFileSync(path.join(dsDir, 'tokens.json'), 'utf8'));

const themes = tokens.color.themes.map((t) => t.id);
const first = themes[0];
const valueFor = (tok, theme) => (typeof tok.value === 'string' ? tok.value : (tok.value[theme] ?? tok.value[first]));
const resolve = (v) => (typeof v === 'string' && /^\{.+\}$/.test(v) ? `var(--${v.slice(1, -1)})` : v);

const lines = [`/* ${tokens.name} — generado desde design-system/tokens.json. No editar a mano: pnpm tokens */`];

// Colores y sombras por tema.
const themed = [...tokens.color.tokens, ...(tokens.shadow?.tokens ?? [])];
for (const theme of themes) {
  const sel = theme === first ? `:root, [data-theme="${theme}"]` : `[data-theme="${theme}"]`;
  lines.push(`${sel} {`);
  if (theme !== first) lines.push('  color-scheme: dark;');
  else lines.push('  color-scheme: light;');
  for (const t of themed) {
    const v = valueFor(t, theme);
    if (theme !== first && typeof t.value === 'string') continue; // sin override: hereda del primer tema
    lines.push(`  --${t.name}: ${resolve(v)};`);
  }
  lines.push('}');
}

// Escalas no temáticas.
lines.push(':root {');
for (const fam of ['spacing', 'radius', 'borderWidth']) for (const t of tokens[fam]?.tokens ?? []) lines.push(`  --${t.name}: ${t.value};`);
for (const [k, v] of Object.entries(tokens.type.families)) lines.push(`  --font-${k}: ${v};`);
lines.push('}');

// Clases tipográficas (.display-xl, .heading-1, .body, …).
for (const g of tokens.type.groups) {
  for (const s of g.styles) {
    const fam = s.family ?? g.family;
    lines.push(
      `.${s.name} { font-family: var(--font-${fam}); font-size: ${s.fontSize}; line-height: ${s.lineHeight}; font-weight: ${s.fontWeight}; ${s.letterSpacing ? `letter-spacing: ${s.letterSpacing};` : ''} }`,
    );
  }
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'tokens.css'), `${lines.join('\n')}\n`, 'utf8');

// bundle.css sin el @import remoto de fuentes (la UI carga Public Sans con next/font).
const bundle = readFileSync(path.join(dsDir, 'components', 'bundle.css'), 'utf8').replace(/@import url\([^)]*\);?\s*/g, '');
writeFileSync(path.join(outDir, 'flock-ui.css'), `/* Copia de design-system/components/bundle.css (sin @import remoto). No editar a mano: pnpm tokens */\n${bundle}`, 'utf8');
console.log(`Tokens generados en ${path.relative(repo, outDir)} (${themed.length} colores/sombras, temas: ${themes.join(', ')})`);
