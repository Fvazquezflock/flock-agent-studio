'use client';

import Link from 'next/link';
import { useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Icon, IconButton, cx } from './core';
import { TextInput } from './forms';

export function Card({ title, subtitle, actions, footer, children, padding = 'default', className, style }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; footer?: ReactNode; children?: ReactNode; padding?: 'default' | 'roomy' | 'none'; className?: string; style?: CSSProperties }) {
  return (
    <div className={cx('fk-card', padding === 'roomy' && 'fk-card--roomy', padding === 'none' && 'fk-card--flush', className)} style={style}>
      {(title || actions) && (
        <div className="fk-card__head">
          <div className="fk-card__titles">
            {title && <h3 className="fk-h3">{title}</h3>}
            {subtitle && <p className="fk-card__sub">{subtitle}</p>}
          </div>
          {actions && <div className="fk-card__actions">{actions}</div>}
        </div>
      )}
      {children !== undefined && <div className="fk-card__body">{children}</div>}
      {footer && <div className="fk-card__foot">{footer}</div>}
    </div>
  );
}

function useEsc(open: boolean, onClose?: () => void) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);
}

export function Modal({ open, onClose, title, description, size = 'md', footer, children }: { open: boolean; onClose?: () => void; title: ReactNode; description?: ReactNode; size?: 'sm' | 'md' | 'lg'; footer?: ReactNode; children?: ReactNode }) {
  useEsc(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fk-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={cx('fk-modal', size !== 'md' && `fk-modal--${size}`)} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="fk-modal__head">
          <div className="fk-modal__titles">
            <h2 className="fk-h2" id={id}>
              {title}
            </h2>
            {description && <p className="fk-modal__desc">{description}</p>}
          </div>
          {onClose && <IconButton icon="x" label="Cerrar" className="fk-modal__close" onClick={onClose} />}
        </div>
        {children !== undefined && <div className="fk-modal__body">{children}</div>}
        {footer && (
          <div className="fk-modal__foot">
            <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, title, description, size = 'md', footer, children }: { open: boolean; onClose?: () => void; title: ReactNode; description?: ReactNode; size?: 'md' | 'lg'; footer?: ReactNode; children?: ReactNode }) {
  useEsc(open, onClose);
  const id = useId();
  if (!open) return null;
  return (
    <div className="fk-drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside className={cx('fk-drawer', size === 'lg' && 'fk-drawer--lg')} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="fk-drawer__head">
          <div className="fk-modal__titles">
            <h2 className="fk-h2" id={id}>
              {title}
            </h2>
            {description && <p className="fk-modal__desc">{description}</p>}
          </div>
          {onClose && <IconButton icon="x" label="Cerrar" className="fk-modal__close" onClick={onClose} />}
        </div>
        <div className="fk-drawer__body">{children}</div>
        {footer && <div className="fk-drawer__foot">{footer}</div>}
      </aside>
    </div>
  );
}

/** Confirmación explícita para acciones sensibles; opcionalmente exige escribir un texto. */
export function ConfirmDialog({ open, onClose, onConfirm, tone = 'danger', title, message, confirmLabel, confirmText, loading }: { open: boolean; onClose: () => void; onConfirm: () => void; tone?: 'danger' | 'warning' | 'info'; title: string; message: ReactNode; confirmLabel: string; confirmText?: string; loading?: boolean }) {
  const [typed, setTyped] = useState('');
  const icon = tone === 'danger' ? 'trash' : tone === 'warning' ? 'alert-triangle' : 'info';
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span className={cx('fk-confirm__icon', `fk-confirm__icon--${tone}`)}>
            <Icon name={icon} size={20} />
          </span>
          {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} disabled={!!confirmText && typed !== confirmText} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="fk-text fk-text--muted">{message}</div>
      {confirmText && (
        <div className="fk-confirm__check">
          <label className="fk-field__label">
            Escribí <b className="fk-mono" style={{ color: 'var(--ink)' }}>{confirmText}</b> para confirmar
          </label>
          <TextInput value={typed} onChange={setTyped} aria-label="Texto de confirmación" />
        </div>
      )}
    </Modal>
  );
}

export function Tabs({ items, value, onChange, label = 'Secciones' }: { items: { value: string; label: string; icon?: string; count?: number }[]; value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="fk-tabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} tabIndex={value === t.value ? 0 : -1} className="fk-tab" onClick={() => onChange(t.value)}>
          {t.icon && <Icon name={t.icon} size={16} />}
          {t.label}
          {t.count !== undefined && <span className="fk-tab__count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Accordion({ items }: { items: { title: ReactNode; meta?: ReactNode; icon?: string; content: ReactNode; defaultOpen?: boolean }[] }) {
  const [open, setOpen] = useState(() => new Set(items.map((it, i) => (it.defaultOpen ? i : -1)).filter((i) => i >= 0)));
  const base = useId();
  return (
    <div className="fk-accordion fk-accordion--card">
      {items.map((it, i) => (
        <div key={i} className="fk-acc">
          <h3 style={{ margin: 0 }}>
            <button
              type="button"
              className="fk-acc__trigger"
              aria-expanded={open.has(i)}
              aria-controls={`${base}${i}`}
              onClick={() =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (n.has(i)) n.delete(i);
                  else n.add(i);
                  return n;
                })
              }
            >
              {it.icon && <Icon name={it.icon} size={18} />}
              <span className="fk-acc__title">{it.title}</span>
              {it.meta && <span className="fk-acc__meta">{it.meta}</span>}
              <Icon name="chevron-down" size={18} className="fk-acc__chev" />
            </button>
          </h3>
          {open.has(i) && (
            <div className="fk-acc__panel" id={`${base}${i}`} role="region">
              {it.content}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function DescriptionList({ items, columns = 2 }: { items: { label: ReactNode; value: ReactNode; span?: number }[]; columns?: number }) {
  return (
    <dl className="fk-dl" style={{ ['--fk-cols' as string]: columns } as CSSProperties}>
      {items.map((it, i) => (
        <div key={i} className="fk-dl__item" style={it.span ? { gridColumn: `span ${it.span}` } : undefined}>
          <dt>{it.label}</dt>
          <dd>{it.value === undefined || it.value === null || it.value === '' ? <span className="fk-dl__empty">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Timeline({ items }: { items: { title: ReactNode; meta?: ReactNode; content?: ReactNode; icon?: string; tone?: 'success' | 'warning' | 'danger' | 'info' | 'brand' }[] }) {
  return (
    <ol className="fk-timeline">
      {items.map((it, i) => (
        <li key={i} className="fk-tl">
          <span className={cx('fk-tl__dot', it.tone && `fk-tl__dot--${it.tone}`)}>
            <Icon name={it.icon || 'circle-dot'} size={14} />
          </span>
          <div className="fk-tl__body">
            <span className="fk-tl__title">{it.title}</span>
            {it.meta && <span className="fk-tl__meta">{it.meta}</span>}
            {it.content && <div className="fk-tl__content">{it.content}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function StatCard({ label, value, icon, hint, href, brand }: { label: string; value: ReactNode; icon?: string; hint?: ReactNode; href?: string; brand?: boolean }) {
  const body = (
    <div className={cx('fk-stat', brand && 'fk-stat--brand')} style={href ? { height: '100%' } : undefined}>
      <div className="fk-stat__top">
        <span>{label}</span>
        {icon && (
          <span className="fk-stat__icon">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <span className="fk-stat__value">{value}</span>
      {hint && <div className="fk-stat__bottom">{hint}</div>}
    </div>
  );
  return href ? (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      {body}
    </Link>
  ) : (
    body
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Ubicación">
      <ol className="fk-crumbs">
        {items.map((it, i) => {
          const last = i === items.length - 1;
          return (
            <li key={i} className="fk-crumbs__item">
              {last || !it.href ? <span aria-current={last ? 'page' : undefined}>{it.label}</span> : <Link href={it.href}>{it.label}</Link>}
              {!last && <Icon name="chevron-right" size={14} className="fk-crumbs__sep" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({ title, description, breadcrumbs, status, actions, tabs }: { title: ReactNode; description?: ReactNode; breadcrumbs?: { label: string; href?: string }[]; status?: ReactNode; actions?: ReactNode; tabs?: ReactNode }) {
  return (
    <div className="fk-pagehead">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="fk-pagehead__row">
        <div className="fk-pagehead__titles">
          <div className="fk-pagehead__title">
            <h1 className="fk-h1">{title}</h1>
            {status}
          </div>
          {description && <p className="fk-pagehead__desc">{description}</p>}
        </div>
        {actions && <div className="fk-pagehead__actions">{actions}</div>}
      </div>
      {tabs}
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  align?: 'right' | 'center';
  width?: number | string;
  wrap?: boolean;
}

/** Tabla de datos del design system (orden y filtros se resuelven del lado del servidor). */
export function DataTable<T extends Record<string, any>>({ columns, rows, rowKey = 'id', onRowClick, empty, toolbar, footer, compact, loading }: { columns: Column<T>[]; rows: T[]; rowKey?: string; onRowClick?: (r: T) => void; empty?: ReactNode; toolbar?: ReactNode; footer?: ReactNode; compact?: boolean; loading?: boolean }) {
  return (
    <div className="fk-tablebox">
      {toolbar}
      <div className="fk-tablescroll">
        <table className={cx('fk-table', compact && 'fk-table--compact', onRowClick && 'fk-table--clickable')}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={cx(c.align === 'right' && 'fk-th--num', c.align === 'center' && 'fk-th--center')} style={{ width: c.width }}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 4 }, (_, i) => (
                <tr key={`sk${i}`}>
                  {columns.map((c) => (
                    <td key={c.key}>
                      <span className="fk-skel" style={{ width: '60%', height: 12, display: 'inline-block' }} />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr className="fk-table__empty">
                <td colSpan={columns.length}>{empty ?? <div className="fk-listbox__empty" style={{ padding: 40 }}>No hay registros para mostrar.</div>}</td>
              </tr>
            )}
            {!loading &&
              rows.map((r, i) => (
                <tr key={String(r[rowKey] ?? i)} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={cx(c.align === 'right' && 'fk-td--num', c.align === 'center' && 'fk-td--center', c.wrap && 'fk-td--wrap')}>
                      {c.render ? c.render(r) : (r[c.key] as ReactNode)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="fk-tablebox__foot">{footer}</div>}
    </div>
  );
}

export function TableToolbar({ title, count, actions }: { title?: ReactNode; count?: number; actions?: ReactNode }) {
  return (
    <div className="fk-ttool">
      <span className="fk-ttool__title">
        {title && <span className="fk-h4">{title}</span>}
        {count !== undefined && <span className="fk-ttool__count">{count.toLocaleString('es-AR')} registros</span>}
      </span>
      {actions}
    </div>
  );
}

export function Grid({ cols = 12, gap = 20, children, className }: { cols?: number; gap?: number; children: ReactNode; className?: string }) {
  return (
    <div className={cx('fk-grid fk-grid--responsive', className)} style={{ ['--fk-cols' as string]: cols, ['--fk-gap' as string]: `${gap}px` } as CSSProperties}>
      {children}
    </div>
  );
}

export function Col({ span = 1, children, className }: { span?: number; children: ReactNode; className?: string }) {
  return (
    <div className={cx('fk-col', className)} style={{ ['--fk-span' as string]: span } as CSSProperties}>
      {children}
    </div>
  );
}
