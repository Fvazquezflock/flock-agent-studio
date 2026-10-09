import { cx, Icon, useControllable, initials } from './core.jsx';
import { Button, IconButton, DropdownMenu, Menu } from './actions.jsx';
import { Avatar } from './people.jsx';
import { EnvBadge } from './feedback.jsx';
import { SearchField } from './forms.jsx';
import { Modal } from './containers.jsx';
const { useState, useMemo, useEffect } = React;

/** AppShell — header + sidebar + content + footer layout. */
export function AppShell({ header, sidebar, footer, children, fixed, style, className }) {
  return (
    <div className={cx('fk-shell', fixed && 'fk-shell--fixed', className)} style={style}>
      {header && <div className="fk-shell__top">{header}</div>}
      {sidebar && <div className="fk-shell__side">{sidebar}</div>}
      <main className="fk-shell__main">{children}</main>
      {footer && <div className="fk-shell__foot">{footer}</div>}
    </div>
  );
}

/** Header — brand top bar with product, environment, search and user. */
export function Header({ logoSrc, product, env, search = true, searchPlaceholder = 'Buscar en Flock (Ctrl+K)', onSearchFocus, notifications, onMenuClick, actions, user, userMenuItems }) {
  return (
    <header className="fk-topbar">
      {onMenuClick && <IconButton icon="menu" label="Abrir menú" variant="inverse" onClick={onMenuClick} />}
      <a className="fk-topbar__brand" href="#" aria-label="Inicio">
        {logoSrc ? <img className="fk-topbar__logo" src={logoSrc} alt="Flock" /> : <span className="fk-topbar__wordmark">flock</span>}
        {product && <span className="fk-topbar__product">{product}</span>}
      </a>
      {env && <EnvBadge env={env} />}
      <div className="fk-topbar__center">
        {search && <div className="fk-topbar__search"><SearchField size="sm" placeholder={searchPlaceholder} shortcut="Ctrl+K" onFocus={onSearchFocus} /></div>}
      </div>
      <div className="fk-topbar__actions">
        {actions}
        {notifications !== undefined && <IconButton icon="bell" label="Notificaciones" variant="inverse" badge={notifications} />}
        <IconButton icon="help-circle" label="Ayuda" variant="inverse" />
        {user && <UserMenu user={user} items={userMenuItems} compact />}
      </div>
    </header>
  );
}

function NavItem({ item, collapsed }) {
  const [open, setOpen] = useState(!!item.defaultOpen || (item.children || []).some((c) => c.active));
  const hasKids = item.children && item.children.length;
  const El = hasKids ? 'button' : 'a';
  return (
    <>
      <El className="fk-nav__item" href={hasKids ? undefined : item.href || '#'} type={hasKids ? 'button' : undefined}
        aria-current={item.active ? 'page' : undefined} aria-expanded={hasKids ? open : undefined} title={collapsed ? item.label : undefined}
        onClick={(e) => { if (hasKids) setOpen(!open); else if (item.onClick) { e.preventDefault(); item.onClick(); } }}>
        {item.icon && <Icon name={item.icon} size={20} />}
        <span className="fk-nav__label">{item.label}</span>
        {item.count !== undefined && <span className="fk-nav__count">{item.count}</span>}
        {hasKids && <Icon name="chevron-right" size={16} className="fk-nav__chev" />}
      </El>
      {hasKids && open && <div className="fk-nav__children">{item.children.map((c, i) => <NavItem key={i} item={c} collapsed={collapsed} />)}</div>}
    </>
  );
}

/** Sidebar — collapsible side navigation with sections, counters and nesting. */
export function Sidebar({ items = [], footerItems = [], collapsed, defaultCollapsed = false, onCollapsedChange, collapsible = true, variant = 'default', label = 'Navegación principal' }) {
  const [c, setC] = useControllable(collapsed, defaultCollapsed, onCollapsedChange);
  return (
    <nav className={cx('fk-sidebar', c && 'fk-sidebar--collapsed', variant === 'brand' && 'fk-sidebar--brand')} aria-label={label}>
      {items.map((it, i) => it.type === 'section'
        ? <div key={i} className="fk-sidebar__section">{it.label}</div>
        : <NavItem key={i} item={it} collapsed={c} />)}
      {(footerItems.length > 0 || collapsible) && (
        <div className="fk-sidebar__foot">
          {footerItems.map((it, i) => <NavItem key={i} item={it} collapsed={c} />)}
          {collapsible && <button type="button" className="fk-nav__item" onClick={() => setC(!c)} aria-label={c ? 'Expandir menú' : 'Colapsar menú'}>
            <Icon name="panel-left" size={20} /><span className="fk-nav__label">Colapsar menú</span></button>}
        </div>
      )}
    </nav>
  );
}

/** Breadcrumbs — where the page sits in the hierarchy. */
export function Breadcrumbs({ items = [] }) {
  return (
    <nav aria-label="Ubicación">
      <ol className="fk-crumbs">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="fk-crumbs__item">
              {last ? <span aria-current="page">{it.label}</span> : <a href={it.href || '#'} onClick={it.onClick}>{it.label}</a>}
              {!last && <Icon name="chevron-right" size={14} className="fk-crumbs__sep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** PageHeader — page title with breadcrumbs, status, description and actions. */
export function PageHeader({ title, description, breadcrumbs, status, actions, onBack, tabs, className }) {
  return (
    <div className={cx('fk-pagehead', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="fk-pagehead__row">
        <div className="fk-pagehead__titles">
          <div className="fk-pagehead__title">
            {onBack && <IconButton icon="arrow-left" label="Volver" className="fk-pagehead__back" onClick={onBack} />}
            <h1 className="fk-h1">{title}</h1>{status}
          </div>
          {description && <p className="fk-pagehead__desc">{description}</p>}
        </div>
        {actions && <div className="fk-pagehead__actions">{actions}</div>}
      </div>
      {tabs}
    </div>
  );
}

/** Tabs — sections inside one page or entity. */
export function Tabs({ items = [], value, defaultValue, onChange, variant = 'line', label = 'Secciones' }) {
  const [v, setV] = useControllable(value, defaultValue ?? (items[0] && items[0].value), onChange);
  const onKey = (e, i) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const n = items[(i + (e.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]; setV(n.value);
  };
  return (
    <div className={cx('fk-tabs', variant === 'pill' && 'fk-tabs--pill')} role="tablist" aria-label={label}>
      {items.map((t, i) => (
        <button key={t.value} type="button" role="tab" aria-selected={v === t.value} tabIndex={v === t.value ? 0 : -1} disabled={t.disabled}
          className="fk-tab" onClick={() => setV(t.value)} onKeyDown={(e) => onKey(e, i)}>
          {t.icon && <Icon name={t.icon} size={16} />}{t.label}{t.count !== undefined && <span className="fk-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
export function TabPanel({ children }) { return <div className="fk-tabpanel" role="tabpanel">{children}</div>; }

function pageList(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const s = new Set([1, pages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => s.add(p));
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach((p) => s.add(p));
  const arr = [...s].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  const out = []; arr.forEach((p, i) => { if (i && p - arr[i - 1] > 1) out.push('…' + i); out.push(p); });
  return out;
}

/** Pagination — navigate pages of a table or list. */
export function Pagination({ page, defaultPage = 1, onPageChange, pageSize, defaultPageSize = 20, onPageSizeChange, total = 0, pageSizes = [10, 20, 50, 100], noun = 'registros', compact }) {
  const [p, setP] = useControllable(page, defaultPage, onPageChange);
  const [size, setSize] = useControllable(pageSize, defaultPageSize, onPageSizeChange);
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total ? (p - 1) * size + 1 : 0, to = Math.min(total, p * size);
  const nf = (n) => n.toLocaleString('es-AR');
  return (
    <nav className="fk-pager" aria-label="Paginación">
      <span className="fk-pager__info">Mostrando {nf(from)}–{nf(to)} de {nf(total)} {noun}</span>
      {!compact && (
        <label className="fk-pager__size">Por página
          <span className="fk-control fk-control--sm" style={{ width: 76 }}>
            <select value={size} onChange={(e) => { setSize(+e.target.value); setP(1); }} style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', cursor: 'pointer', outline: 0 }}>
              {pageSizes.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </span>
        </label>
      )}
      <div className="fk-pager__pages">
        <IconButton icon="chevron-left" label="Página anterior" size="sm" disabled={p <= 1} onClick={() => setP(p - 1)} />
        {pageList(p, pages).map((x) => typeof x === 'string'
          ? <span key={x} className="fk-pager__gap">…</span>
          : <button key={x} type="button" className="fk-pager__page" aria-current={x === p ? 'page' : undefined} onClick={() => setP(x)}>{x}</button>)}
        <IconButton icon="chevron-right" label="Página siguiente" size="sm" disabled={p >= pages} onClick={() => setP(p + 1)} />
      </div>
    </nav>
  );
}

/** Stepper — progress through a multi-step flow. */
export function Stepper({ steps = [], current = 0, vertical, onStepClick }) {
  return (
    <ol className={cx('fk-steps', vertical && 'fk-steps--vertical')}>
      {steps.map((s, i) => {
        const status = s.status || (i < current ? 'done' : i === current ? 'current' : 'upcoming');
        return (
          <li key={i} className={cx('fk-step', 'fk-step--' + status)} aria-current={status === 'current' ? 'step' : undefined} onClick={onStepClick ? () => onStepClick(i) : undefined} style={onStepClick ? { cursor: 'pointer' } : undefined}>
            <div className="fk-step__top">
              <span className="fk-step__dot">{status === 'done' ? <Icon name="check" size={14} strokeWidth={2.5} /> : status === 'error' ? <Icon name="x" size={14} strokeWidth={2.5} /> : i + 1}</span>
              <span className="fk-step__line" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="fk-step__label">{s.label}</span>
              {s.description && <span className="fk-step__desc" style={{ marginTop: 0 }}>{s.description}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** UserMenu — avatar trigger with profile, preferences, theme and sign-out. */
export function UserMenu({ user = {}, items, compact, defaultOpen, onSignOut, theme, onThemeChange }) {
  const menuItems = items || [
    { label: 'Mi perfil', icon: 'user' },
    { label: 'Preferencias', icon: 'settings' },
    { label: theme === 'dark' ? 'Tema claro' : 'Tema oscuro', icon: theme === 'dark' ? 'sun' : 'moon', onSelect: () => onThemeChange && onThemeChange(theme === 'dark' ? 'light' : 'dark') },
    { type: 'separator' },
    { label: 'Cerrar sesión', icon: 'logout', onSelect: onSignOut },
  ];
  return (
    <DropdownMenu placement="end" defaultOpen={defaultOpen}
      header={<div className="fk-usermenu__head"><Avatar name={user.name} src={user.avatar} size="lg" /><div className="fk-usermenu__who"><span className="fk-text">{user.name}</span><span className="fk-usermenu__mail">{user.email}</span></div></div>}
      items={[{ type: 'separator' }, ...menuItems]}
      trigger={
        <button type="button" className="fk-usermenu__trigger" aria-label={'Menú de ' + (user.name || 'usuario')}>
          <Avatar name={user.name} src={user.avatar} size="sm" />
          {!compact && <span className="fk-usermenu__who"><span className="fk-usermenu__name">{user.name}</span>{user.role && <span className="fk-usermenu__role">{user.role}</span>}</span>}
          <Icon name="chevron-down" size={16} />
        </button>} />
  );
}

/** CommandPalette — global search and quick actions (Ctrl+K). */
export function CommandPalette({ open = true, onClose, groups = [], placeholder = 'Buscá pantallas, registros o acciones…', inline, onSelect }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const n = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filtered = useMemo(() => groups.map((g) => ({ ...g, items: g.items.filter((i) => !q || n(i.label).includes(n(q))) })).filter((g) => g.items.length), [q, groups]);
  const flat = filtered.flatMap((g) => g.items);
  useEffect(() => setActive(0), [q]);
  if (!open) return null;
  let idx = -1;
  return (
    <Modal open inline={inline} onClose={onClose} size="md" bare top>
      <div className="fk-cmdk">
        <div className="fk-cmdk__search"><Icon name="search" size={20} />
          <input autoFocus={!inline} value={q} placeholder={placeholder} onChange={(e) => setQ(e.target.value)} aria-label="Buscar comando"
            onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); } if (e.key === 'Enter' && flat[active]) onSelect && onSelect(flat[active]); }} />
          <kbd className="fk-kbd">Esc</kbd>
        </div>
        <div className="fk-cmdk__list" role="listbox">
          {filtered.length === 0 && <div className="fk-listbox__empty">No encontramos resultados para “{q}”.</div>}
          {filtered.map((g) => (
            <div key={g.label}>
              <div className="fk-menu__label">{g.label}</div>
              {g.items.map((it) => { idx++; const i = idx; return (
                <button key={it.label} type="button" role="option" aria-selected={i === active} className="fk-menu__item" data-active={i === active} onMouseEnter={() => setActive(i)} onClick={() => onSelect && onSelect(it)}>
                  {it.icon && <Icon name={it.icon} size={18} />}<span>{it.label}</span>
                  {it.hint && <span className="fk-menu__trail">{it.hint}</span>}
                  {it.shortcut && <span className="fk-menu__trail">{it.shortcut.split('+').map((k) => <kbd key={k} className="fk-kbd">{k}</kbd>)}</span>}
                </button>); })}
            </div>
          ))}
        </div>
        <div className="fk-cmdk__foot"><span><kbd className="fk-kbd">↑</kbd><kbd className="fk-kbd">↓</kbd> navegar</span><span><kbd className="fk-kbd">Enter</kbd> abrir</span><span><kbd className="fk-kbd">Esc</kbd> cerrar</span></div>
      </div>
    </Modal>
  );
}

/** AppFooter — version, environment and support links. */
export function AppFooter({ product, version, env, links = [{ label: 'Soporte', href: '#' }, { label: 'Novedades', href: '#' }] }) {
  return (
    <footer className="fk-appfoot">
      <span>© Flock IT</span>
      {product && <><span className="fk-appfoot__sep" /><span>{product}</span></>}
      {version && <><span className="fk-appfoot__sep" /><span className="fk-mono" style={{ fontSize: 12 }}>v{version}</span></>}
      {env && <><span className="fk-appfoot__sep" /><EnvBadge env={env} /></>}
      <span className="fk-appfoot__links">{links.map((l) => <a key={l.label} href={l.href}>{l.label}</a>)}</span>
    </footer>
  );
}

const gapOf = (g) => (typeof g === 'number' ? g + 'px' : g ? `var(--${g})` : undefined);
/** Grid — 12-column layout grid. */
export function Grid({ cols = 12, gap = 'space-20', responsive = true, children, className, style }) {
  return <div className={cx('fk-grid', responsive && 'fk-grid--responsive', className)} style={{ '--fk-cols': cols, '--fk-gap': gapOf(gap), ...style }}>{children}</div>;
}
export function Col({ span = 1, children, className, style }) {
  return <div className={cx('fk-col', className)} style={{ '--fk-span': span, ...style }}>{children}</div>;
}
/** Stack — vertical or horizontal flow with a token gap. */
export function Stack({ direction = 'column', gap = 'space-15', children, className, style, align, justify }) {
  return <div className={cx('fk-stack', direction === 'row' && 'fk-stack--row', className)} style={{ '--fk-gap': gapOf(gap), alignItems: align, justifyContent: justify, ...style }}>{children}</div>;
}
