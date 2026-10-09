import { cx, Icon } from './core.jsx';
import { Button, IconButton } from './actions.jsx';
const { useState } = React;

const TONE_ICON = { info: 'info', success: 'check-circle', warning: 'alert-triangle', danger: 'alert-circle', brand: 'sparkles' };

/** Alert — inline or page-wide message: info, success, warning, error. */
export function Alert({ tone = 'info', title, children, actions, onClose, banner, outline, icon, className }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className={cx('fk-alert', tone !== 'info' && 'fk-alert--' + tone, banner && 'fk-alert--banner', outline && 'fk-alert--outline', className)} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={icon || TONE_ICON[tone]} size={20} className="fk-alert__icon" />
      <div className="fk-alert__body">
        {title && <span className="fk-alert__title">{title}</span>}
        {children && <span className="fk-alert__text">{children}</span>}
        {actions && <div className="fk-alert__actions">{actions}</div>}
      </div>
      {onClose && <IconButton icon="x" label="Cerrar aviso" size="sm" className="fk-alert__close" variant={tone === 'brand' ? 'inverse' : 'ghost'} onClick={() => { setHidden(true); onClose(); }} />}
    </div>
  );
}

/** Toast — brief confirmation of an action; use inside ToastStack. */
export function Toast({ tone = 'success', title, children, action, onClose }) {
  return (
    <div className={cx('fk-toast', 'fk-toast--' + tone)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={TONE_ICON[tone]} size={20} className="fk-toast__icon" />
      <div className="fk-toast__body">
        {title && <span className="fk-toast__title">{title}</span>}
        {children && <span className="fk-toast__text">{children}</span>}
        {action && <span className="fk-toast__action">{action}</span>}
      </div>
      {onClose && <IconButton icon="x" label="Cerrar" size="sm" className="fk-toast__close" onClick={onClose} />}
    </div>
  );
}
export function ToastStack({ children, inline }) {
  return <div className={cx('fk-toasts', inline && 'fk-toasts--inline')} aria-live="polite">{children}</div>;
}

/** StatusBadge — the state of a record, always dot + word. */
export function StatusBadge({ tone = 'neutral', children, size = 'md', outline, dot = true }) {
  return <span className={cx('fk-status', tone !== 'neutral' && 'fk-status--' + tone, size === 'sm' && 'fk-status--sm', outline && 'fk-status--outline')}>{dot && <span className="fk-status__dot" />}{children}</span>;
}

/** Tag — category, technology or label; optionally selectable or removable. */
export function Tag({ children, onRemove, selected, onClick, variant, size = 'md', swatch, icon }) {
  const selectable = onClick || selected !== undefined;
  const El = selectable ? 'button' : 'span';
  return (
    <El type={selectable ? 'button' : undefined} onClick={onClick} aria-pressed={selectable ? !!selected : undefined}
      className={cx('fk-tag', onRemove && 'fk-tag--removable', selectable && 'fk-tag--selectable', variant === 'brand' && 'fk-tag--brand', size === 'sm' && 'fk-tag--sm')}>
      {swatch && <span className="fk-tag__swatch" style={{ background: swatch }} />}
      {icon && <Icon name={icon} size={14} />}
      {children}
      {onRemove && <button type="button" className="fk-tag__remove" aria-label={'Quitar ' + children} onClick={(e) => { e.stopPropagation(); onRemove(); }}><Icon name="x" size={12} /></button>}
    </El>
  );
}

/** Skeleton — placeholder while content loads. */
export function Skeleton({ width = '100%', height = 12, circle, lines, radius, style }) {
  if (lines) return <div className="fk-skel-lines" aria-hidden="true">{Array.from({ length: lines }, (_, i) => <span key={i} className="fk-skel fk-skel--text" style={{ width: i === lines - 1 ? '60%' : '100%' }} />)}</div>;
  return <span aria-hidden="true" className={cx('fk-skel', circle && 'fk-skel--circle')} style={{ width, height: circle ? width : height, borderRadius: radius, ...style }} />;
}

/** ProgressBar — progress of a long process (import, file generation). */
export function ProgressBar({ value = 0, label, hint, tone = 'primary', size = 'md', indeterminate, showValue = true }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('fk-progress', tone !== 'primary' && 'fk-progress--' + tone, size === 'sm' && 'fk-progress--sm', indeterminate && 'fk-progress--indeterminate')}>
      {(label || showValue) && !indeterminate && <div className="fk-progress__top"><span>{label}</span>{showValue && <span className="fk-progress__pct">{Math.round(v)}%</span>}</div>}
      {indeterminate && label && <div className="fk-progress__top"><span>{label}</span></div>}
      <div className="fk-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : v} aria-label={label}>
        <div className="fk-progress__fill" style={{ width: v + '%' }} />
      </div>
      {hint && <span className="fk-progress__hint">{hint}</span>}
    </div>
  );
}
export function ProgressRing({ value = 0, size = 48, stroke = 5, label }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span className="fk-ring" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <svg width={size} height={size}><circle className="fk-ring__track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} /><circle className="fk-ring__fill" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} /></svg>
      <span className="fk-ring__label">{Math.round(value)}%</span>
    </span>
  );
}

/** EmptyState — no data yet, or no results for the current filters. */
export function EmptyState({ icon = 'inbox', title, children, actions, compact }) {
  return (
    <div className={cx('fk-empty', compact && 'fk-empty--compact')}>
      <span className="fk-empty__icon"><Icon name={icon} size={compact ? 20 : 24} /></span>
      {title && <h3 className="fk-h3">{title}</h3>}
      {children && <p className="fk-empty__text">{children}</p>}
      {actions && <div className="fk-empty__actions">{actions}</div>}
    </div>
  );
}

const ERRORS = {
  404: { title: 'No encontramos esta página', text: 'Puede que el enlace esté mal escrito o que la página se haya movido.', icon: 'search' },
  403: { title: 'No tenés permiso para ver esto', text: 'Pedile acceso a la persona responsable del módulo o volvé al inicio.', icon: 'lock' },
  500: { title: 'Algo salió mal de nuestro lado', text: 'Ya registramos el error. Probá de nuevo en unos minutos.', icon: 'alert-triangle' },
  503: { title: 'Estamos haciendo mantenimiento', text: 'El sistema vuelve a estar disponible hoy a las 20:00.', icon: 'hourglass' },
};
/** ErrorPage — 404, 403, 500 and maintenance screens. */
export function ErrorPage({ code = 404, title, children, actions, requestId, brand, logoSrc }) {
  const e = ERRORS[code] || ERRORS[500];
  return (
    <div className={cx('fk-errpage', brand && 'fk-errpage--brand')}>
      <div className="fk-errpage__inner">
        {brand && logoSrc && <img className="fk-errpage__logo" src={logoSrc} alt="Flock" />}
        <span className="fk-errpage__code">{code}</span>
        <h1 className="fk-errpage__title">{title || e.title}</h1>
        <p className="fk-errpage__text">{children || e.text}</p>
        <div className="fk-errpage__actions">{actions || <><Button variant={brand ? 'brand' : 'primary'} icon="home">Ir al inicio</Button><Button variant={brand ? 'inverse' : 'secondary'} icon="arrow-left">Volver</Button></>}</div>
        {requestId && <span className="fk-errpage__meta">ID de error: {requestId}</span>}
      </div>
    </div>
  );
}

const ENV_LABEL = { dev: 'DEV', test: 'TEST', uat: 'UAT', prod: 'PROD' };
/** EnvBadge — which environment you are in (DEV / TEST / UAT / PROD). */
export function EnvBadge({ env = 'test', strip }) {
  const k = String(env).toLowerCase();
  return <span className={cx('fk-env', 'fk-env--' + k, strip && 'fk-env--strip')} title={'Ambiente ' + (ENV_LABEL[k] || env)}>{!strip && <span className="fk-env__dot" />}{!strip && (ENV_LABEL[k] || String(env).toUpperCase())}</span>;
}
