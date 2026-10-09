import ICONS from './icons.js';
const { useState, useEffect, useRef, useCallback, useId } = React;

export const cx = (...a) => a.filter(Boolean).join(' ');

export function useControllable(value, defaultValue, onChange) {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const v = controlled ? value : inner;
  const set = useCallback((next) => {
    const n = typeof next === 'function' ? next(v) : next;
    if (!controlled) setInner(n);
    onChange && onChange(n);
  }, [controlled, v, onChange]);
  return [v, set];
}

export function useOutside(ref, onOut, active = true) {
  useEffect(() => {
    if (!active) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onOut(e); };
    const k = (e) => { if (e.key === 'Escape') onOut(e); };
    document.addEventListener('mousedown', h);
    document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [ref, onOut, active]);
}

export function useUid(prefix = 'fk') { const id = useId(); return prefix + id.replace(/:/g, ''); }

const toAttrs = (a) => { const o = {}; for (const k in a) o[k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = a[k]; return o; };

/** Icon — Lucide line icons (ISC), 1.75px stroke. */
export function Icon({ name, size = 18, strokeWidth = 1.75, label, className, style }) {
  const nodes = ICONS[name];
  if (!nodes) return null;
  return (
    <svg className={cx('fk-icon', className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" role={label ? 'img' : undefined}
      aria-label={label} aria-hidden={label ? undefined : true} style={style}>
      {nodes.map(([tag, attrs], i) => React.createElement(tag, { key: i, ...toAttrs(attrs) }))}
    </svg>
  );
}
Icon.names = Object.keys(ICONS);

/** Spinner — indeterminate loading indicator. */
export function Spinner({ size = 20, label, className }) {
  const r = 9;
  const svg = (
    <svg className={cx('fk-spinner', className)} width={size} height={size} viewBox="0 0 24 24" role="status" aria-label={label || 'Cargando'}>
      <circle className="fk-spinner__track" cx="12" cy="12" r={r} strokeWidth="2.5" />
      <circle cx="12" cy="12" r={r} strokeWidth="2.5" strokeDasharray={`${Math.PI * r * 0.6} ${Math.PI * 2 * r}`} />
    </svg>
  );
  return label ? <span className="fk-spinner-wrap">{svg}<span>{label}</span></span> : svg;
}

/** Popup — anchored overlay used by menus, selects, pickers.
 *  `fixed` positions the layer against the viewport so it escapes scrolling or clipped containers (tables). */
export function Popup({ open, onClose, trigger, children, placement = 'start', block, className, layerClassName, staticLayer, fixed }) {
  const ref = useRef(null);
  const layer = useRef(null);
  const [pos, setPos] = useState(null);
  useOutside(ref, () => onClose && onClose(), open && !staticLayer);
  React.useLayoutEffect(() => {
    if (!open || !fixed) { setPos(null); return undefined; }
    const place = () => {
      if (!ref.current || !layer.current) return;
      const a = ref.current.getBoundingClientRect();
      const h = layer.current.offsetHeight, w = layer.current.offsetWidth;
      let top = a.bottom + 6;
      if (top + h > window.innerHeight - 8 && a.top - h - 6 > 8) top = a.top - h - 6;
      let left = placement === 'end' ? a.right - w : a.left;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top, left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); };
  }, [open, fixed, placement]);
  const style = fixed ? { position: 'fixed', top: pos ? pos.top : -9999, left: pos ? pos.left : -9999, right: 'auto', bottom: 'auto', zIndex: 85 } : undefined;
  return (
    <div ref={ref} className={cx('fk-anchor', block && 'fk-anchor--block', className)}>
      {trigger}
      {open && <div ref={layer} className={cx('fk-layer', 'fk-layer--' + placement, layerClassName)} style={style}>{children}</div>}
    </div>
  );
}

export const fmtMoney = (n, { currency = true, decimals = 2 } = {}) => {
  if (n === null || n === undefined || n === '' || isNaN(n)) return '';
  const s = new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
  return currency ? '$ ' + s : s;
};
export const parseAR = (s) => {
  if (typeof s === 'number') return s;
  if (!s) return null;
  const n = parseFloat(String(s).replace(/[^\d,-]/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};
export const pad2 = (n) => String(n).padStart(2, '0');
export const fmtDate = (d) => d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '';
export const parseDate = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
export const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // monday first
  const start = new Date(year, month, 1 - offset);
  const days = [];
  for (let i = 0; i < 42; i++) days.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  if (days[35].getMonth() !== month) days.length = 35;
  return days;
}
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
