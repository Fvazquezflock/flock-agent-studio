import type { Config } from 'tailwindcss';

// Los colores, radios y sombras apuntan a las variables generadas desde design-system/tokens.json.
const color = (name: string) => `var(--${name})`;
const names = [
  'bg', 'surface', 'surface-subtle', 'surface-raised', 'surface-brand', 'ink', 'ink-muted', 'ink-subtle', 'on-brand',
  'border', 'border-strong', 'primary', 'primary-hover', 'on-primary', 'primary-text', 'primary-subtle', 'accent', 'on-accent',
  'focus', 'success', 'success-subtle', 'warning', 'warning-subtle', 'danger', 'danger-subtle', 'on-danger', 'info', 'info-subtle',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-other', 'brand-night', 'brand-purple', 'brand-lilac', 'brand-orange',
];

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: Object.fromEntries(names.map((n) => [n, color(n)])),
      borderColor: { DEFAULT: color('border') },
      fontFamily: { sans: ['var(--font-sans)'], mono: ['var(--font-mono)'] },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)' },
      boxShadow: { sm: 'var(--shadow-sm)', overlay: 'var(--shadow-overlay)' },
      spacing: { 5.5: '22px', 7.5: '30px' },
    },
  },
  plugins: [],
};

export default config;
