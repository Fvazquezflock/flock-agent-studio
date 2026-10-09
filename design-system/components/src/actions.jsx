import { cx, Icon, Spinner, Popup, useControllable } from './core.jsx';
const { useState } = React;

/** Button — pill action. */
export function Button({ variant = 'primary', size = 'md', icon, iconRight, loading, block, href, className, children, type = 'button', ...rest }) {
  const cls = cx('fk-btn', 'fk-btn--' + variant, size !== 'md' && 'fk-btn--' + size, block && 'fk-btn--block', loading && 'fk-btn--loading', className);
  const isz = size === 'sm' ? 16 : 18;
  const inner = (
    <>
      {icon && <Icon name={icon} size={isz} />}
      {children != null && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={isz} />}
      {loading && <span className="fk-btn__spin"><Spinner size={isz} label="" /></span>}
    </>
  );
  if (href) return <a className={cls} href={href} {...rest}>{inner}</a>;
  return <button type={type} className={cls} aria-busy={loading || undefined} {...rest}>{inner}</button>;
}

/** IconButton — compact action with only an icon; label is required for a11y. */
export function IconButton({ icon, label, variant = 'ghost', size = 'md', badge, className, pressed, ...rest }) {
  const isz = size === 'sm' ? 16 : size === 'lg' ? 22 : 20;
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={pressed}
      className={cx('fk-iconbtn', variant !== 'ghost' && 'fk-iconbtn--' + variant, size !== 'md' && 'fk-iconbtn--' + size, className)} {...rest}>
      <Icon name={icon} size={isz} />
      {badge === true && <span className="fk-iconbtn__badge fk-iconbtn__badge--dot" />}
      {badge !== undefined && badge !== true && badge !== false && badge !== 0 && <span className="fk-iconbtn__badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

/** Link — inline navigation. */
export function Link({ variant = 'default', external, className, children, ...rest }) {
  const extra = external ? { target: '_blank', rel: 'noreferrer' } : {};
  return (
    <a className={cx('fk-link', variant !== 'default' && 'fk-link--' + variant, className)} {...extra} {...rest}>
      {children}{external && <Icon name="external-link" size={14} />}
    </a>
  );
}

/** Menu — the list rendered inside DropdownMenu, UserMenu and row actions. */
export function Menu({ items = [], onSelect, header }) {
  return (
    <div className="fk-menu" role="menu">
      {header}
      {items.map((it, i) => {
        if (it.type === 'separator') return <hr key={i} className="fk-menu__sep" />;
        if (it.type === 'label') return <div key={i} className="fk-menu__label">{it.label}</div>;
        const checkable = it.checked !== undefined;
        return (
          <button key={i} type="button" role={checkable ? 'menuitemcheckbox' : 'menuitem'} aria-checked={checkable ? it.checked : undefined}
            disabled={it.disabled} className={cx('fk-menu__item', it.danger && 'fk-menu__item--danger')}
            onClick={() => { it.onSelect && it.onSelect(); onSelect && onSelect(it); }}>
            {checkable ? <span className="fk-menu__check">{it.checked && <Icon name="check" size={16} />}</span> : it.icon && <Icon name={it.icon} size={16} />}
            <span>{it.label}</span>
            {it.shortcut && <span className="fk-menu__trail">{it.shortcut}</span>}
            {it.trail && <span className="fk-menu__trail">{it.trail}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** DropdownMenu — trigger + floating menu of actions. */
export function DropdownMenu({ trigger, items, placement = 'start', open, defaultOpen = false, onOpenChange, header, closeOnSelect = true, fixed }) {
  const [isOpen, setOpen] = useControllable(open, defaultOpen, onOpenChange);
  const t = React.cloneElement(trigger, { onClick: (e) => { trigger.props.onClick && trigger.props.onClick(e); setOpen(!isOpen); }, 'aria-haspopup': 'menu', 'aria-expanded': isOpen });
  return (
    <Popup open={isOpen} onClose={() => setOpen(false)} trigger={t} placement={placement} fixed={fixed}>
      <Menu items={items} header={header} onSelect={() => closeOnSelect && setOpen(false)} />
    </Popup>
  );
}

/** SplitButton — main action plus a menu of alternatives. */
export function SplitButton({ children, icon, onClick, items = [], variant = 'primary', size = 'md', defaultOpen, disabled }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Popup open={open} onClose={() => setOpen(false)} placement="end" className={cx('fk-split', variant === 'secondary' && 'fk-split--secondary')}
      trigger={<>
        <Button variant={variant} size={size} icon={icon} onClick={onClick} disabled={disabled}>{children}</Button>
        <button type="button" disabled={disabled} className={cx('fk-btn', 'fk-btn--' + variant, size !== 'md' && 'fk-btn--' + size, 'fk-split__toggle')}
          aria-label="Más opciones" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name="chevron-down" size={16} />
        </button>
      </>}>
      <Menu items={items} onSelect={() => setOpen(false)} />
    </Popup>
  );
}

/** SegmentedControl — pick one of a few views or periods. */
export function SegmentedControl({ options = [], value, defaultValue, onChange, size = 'md', block, label }) {
  const [v, setV] = useControllable(value, defaultValue ?? (options[0] && (options[0].value ?? options[0])), onChange);
  return (
    <div className={cx('fk-seg', size === 'sm' && 'fk-seg--sm', block && 'fk-seg--block')} role="group" aria-label={label}>
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o;
        return (
          <button key={opt.value} type="button" className="fk-seg__item" aria-pressed={v === opt.value} onClick={() => setV(opt.value)}>
            {opt.icon && <Icon name={opt.icon} size={16} />}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

/** BulkActionBar — actions over the selected rows. */
export function BulkActionBar({ count = 0, noun = ['elemento seleccionado', 'elementos seleccionados'], actions = [], onClear, floating }) {
  if (!count) return null;
  return (
    <div className={cx('fk-bulk', floating && 'fk-bulk--floating')} role="toolbar" aria-label="Acciones sobre la selección">
      <span className="fk-bulk__count"><span className="fk-bulk__num">{count}</span>{count === 1 ? noun[0] : noun[1]}</span>
      {actions.map((a, i) => <Button key={i} size="sm" variant="inverse" icon={a.icon} onClick={a.onClick}>{a.label}</Button>)}
      <span className="fk-bulk__sep" />
      <IconButton icon="x" label="Deseleccionar todo" size="sm" variant="inverse" onClick={onClear} />
    </div>
  );
}
