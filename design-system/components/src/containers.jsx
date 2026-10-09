import { cx, Icon, Popup, useControllable, useUid } from './core.jsx';
import { Button, IconButton } from './actions.jsx';
import { TextInput } from './forms.jsx';
const { useState, useEffect } = React;

/** Card — container with optional header, actions and footer. */
export function Card({ title, subtitle, actions, footer, children, variant = 'default', padding = 'default', interactive, selected, onClick, className, style }) {
  const El = interactive ? 'button' : 'div';
  return (
    <El className={cx('fk-card', variant !== 'default' && 'fk-card--' + variant, padding === 'roomy' && 'fk-card--roomy', padding === 'none' && 'fk-card--flush', interactive && 'fk-card--interactive', selected && 'fk-card--selected', className)}
      onClick={onClick} type={interactive ? 'button' : undefined} style={style}>
      {(title || actions) && (
        <div className="fk-card__head">
          <div className="fk-card__titles">{title && <h3 className="fk-h3">{title}</h3>}{subtitle && <p className="fk-card__sub">{subtitle}</p>}</div>
          {actions && <div className="fk-card__actions">{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className="fk-card__body">{children}</div>}
      {footer && <div className="fk-card__foot">{footer}</div>}
    </El>
  );
}

function useEsc(open, onClose) {
  useEffect(() => {
    if (!open) return;
    const k = (e) => e.key === 'Escape' && onClose && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
}

/** Modal — focused dialog for short forms and decisions. */
export function Modal({ open, onClose, title, description, size = 'md', footer, footerStart, children, inline, bare, top, closeOnBackdrop = true, icon }) {
  useEsc(open && !inline, onClose);
  const id = useUid('m');
  if (!open) return null;
  return (
    <div className={cx('fk-backdrop', top && 'fk-backdrop--top', inline && 'fk-backdrop--inline')} onMouseDown={(e) => { if (closeOnBackdrop && e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={cx('fk-modal', size !== 'md' && 'fk-modal--' + size)} role="dialog" aria-modal="true" aria-labelledby={title ? id : undefined}>
        {bare ? children : <>
          <div className="fk-modal__head">
            {icon}
            <div className="fk-modal__titles">{title && <h2 className="fk-h2" id={id}>{title}</h2>}{description && <p className="fk-modal__desc">{description}</p>}</div>
            {onClose && <IconButton icon="x" label="Cerrar" className="fk-modal__close" onClick={onClose} />}
          </div>
          {children !== undefined && <div className="fk-modal__body">{children}</div>}
          {footer && <div className={cx('fk-modal__foot', footerStart && 'fk-modal__foot--split')}>{footerStart && <div>{footerStart}</div>}<div style={{ display: 'flex', gap: 10 }}>{footer}</div></div>}
        </>}
      </div>
    </div>
  );
}

/** ConfirmDialog — explicit confirmation for destructive or irreversible actions. */
export function ConfirmDialog({ open, onClose, onConfirm, tone = 'danger', title, message, confirmLabel = 'Eliminar', cancelLabel = 'Cancelar', confirmText, loading, inline }) {
  const [typed, setTyped] = useState('');
  const icon = tone === 'danger' ? 'trash' : tone === 'warning' ? 'alert-triangle' : 'info';
  const blocked = confirmText && typed !== confirmText;
  return (
    <Modal open={open} onClose={onClose} size="sm" inline={inline} title={title}
      icon={<span className={cx('fk-confirm__icon', 'fk-confirm__icon--' + tone)}><Icon name={icon} size={20} /></span>}
      footer={<><Button variant="secondary" onClick={onClose}>{cancelLabel}</Button><Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={blocked} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="fk-text fk-text--muted">{message}</div>
      {confirmText && <div className="fk-confirm__check"><label className="fk-field__label">Escribí <b className="fk-mono" style={{ color: 'var(--ink)' }}>{confirmText}</b> para confirmar</label><TextInput value={typed} onChange={setTyped} aria-label="Texto de confirmación" /></div>}
    </Modal>
  );
}

/** Drawer — side panel for detail or editing without leaving the list. */
export function Drawer({ open, onClose, title, description, side = 'right', size = 'md', footer, children, inline, headerExtra }) {
  useEsc(open && !inline, onClose);
  const id = useUid('d');
  if (!open) return null;
  return (
    <div className={cx('fk-drawer-backdrop', side === 'left' && 'fk-drawer-backdrop--left', inline && 'fk-drawer-backdrop--inline')} onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <aside className={cx('fk-drawer', size === 'lg' && 'fk-drawer--lg')} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="fk-drawer__head">
          <div className="fk-modal__titles"><h2 className="fk-h2" id={id}>{title}</h2>{description && <p className="fk-modal__desc">{description}</p>}{headerExtra}</div>
          {onClose && <IconButton icon="x" label="Cerrar" className="fk-modal__close" onClick={onClose} />}
        </div>
        <div className="fk-drawer__body">{children}</div>
        {footer && <div className="fk-drawer__foot">{footer}</div>}
      </aside>
    </div>
  );
}

/** Tooltip — short help on hover/focus; labels icon-only buttons. */
export function Tooltip({ content, placement = 'top', open, children, wrap }) {
  const [hover, setHover] = useState(false);
  const show = open !== undefined ? open : hover;
  return (
    <span className="fk-tipwrap" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} onFocus={() => setHover(true)} onBlur={() => setHover(false)}>
      {children}
      {show && <span role="tooltip" className={cx('fk-tip', placement !== 'top' && 'fk-tip--' + placement, wrap && 'fk-tip--wrap')}>{content}</span>}
    </span>
  );
}

/** Popover — floating panel with interactive content. */
export function Popover({ trigger, title, children, footer, open, defaultOpen = false, onOpenChange, placement = 'start', width }) {
  const [o, setO] = useControllable(open, defaultOpen, onOpenChange);
  const t = React.cloneElement(trigger, { onClick: () => setO(!o), 'aria-expanded': o, 'aria-haspopup': 'dialog' });
  return (
    <Popup open={o} onClose={() => setO(false)} trigger={t} placement={placement}>
      <div className="fk-popover" role="dialog" style={width ? { '--fk-w': width + 'px' } : undefined}>
        {title && <div className="fk-popover__head"><span className="fk-popover__title">{title}</span><IconButton icon="x" label="Cerrar" size="sm" onClick={() => setO(false)} /></div>}
        <div className="fk-popover__body">{children}</div>
        {footer && <div className="fk-popover__foot">{footer}</div>}
      </div>
    </Popup>
  );
}

/** Accordion — collapsible sections. */
export function Accordion({ items = [], multiple = false, variant = 'plain', defaultOpen }) {
  const [open, setOpen] = useState(() => new Set(defaultOpen ?? items.map((it, i) => (it.defaultOpen ? i : -1)).filter((i) => i >= 0)));
  const toggle = (i) => setOpen((s) => { const n = new Set(multiple ? s : []); if (s.has(i)) n.delete(i); else n.add(i); return n; });
  const base = useUid('acc');
  return (
    <div className={cx('fk-accordion', variant === 'card' && 'fk-accordion--card')}>
      {items.map((it, i) => (
        <div key={i} className="fk-acc">
          <h3 style={{ margin: 0 }}>
            <button type="button" className="fk-acc__trigger" aria-expanded={open.has(i)} aria-controls={base + i} onClick={() => toggle(i)}>
              {it.icon && <Icon name={it.icon} size={18} />}<span className="fk-acc__title">{it.title}</span>
              {it.meta && <span className="fk-acc__meta">{it.meta}</span>}
              <Icon name="chevron-down" size={18} className="fk-acc__chev" />
            </button>
          </h3>
          {open.has(i) && <div className="fk-acc__panel" id={base + i} role="region">{it.content}</div>}
        </div>
      ))}
    </div>
  );
}

/** Divider — separates blocks; optional centered label. */
export function Divider({ label, vertical, strong, style }) {
  if (label) return <div className="fk-divider fk-divider--label" role="separator" style={style}>{label}</div>;
  return <hr className={cx('fk-divider', vertical && 'fk-divider--vertical', strong && 'fk-divider--strong')} aria-orientation={vertical ? 'vertical' : undefined} style={style} />;
}
