'use client';

import { createElement, forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import ICONS from './icons';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

const toAttrs = (a: Record<string, string>) => {
  const o: Record<string, string> = {};
  for (const k in a) o[k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())] = a[k];
  return o;
};

/** Icon — set de línea Lucide del design system (trazo 1.75). */
export function Icon({ name, size = 18, strokeWidth = 1.75, label, className, style }: { name: string; size?: number; strokeWidth?: number; label?: string; className?: string; style?: CSSProperties }) {
  const nodes = ICONS[name];
  if (!nodes) return null;
  return (
    <svg
      className={cx('fk-icon', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={style}
    >
      {nodes.map(([tag, attrs], i) => createElement(tag, { key: i, ...toAttrs(attrs) }))}
    </svg>
  );
}

export function Spinner({ size = 20, label, className }: { size?: number; label?: string; className?: string }) {
  const r = 9;
  const svg = (
    <svg className={cx('fk-spinner', className)} width={size} height={size} viewBox="0 0 24 24" role="status" aria-label={label || 'Cargando'}>
      <circle className="fk-spinner__track" cx="12" cy="12" r={r} strokeWidth="2.5" />
      <circle cx="12" cy="12" r={r} strokeWidth="2.5" strokeDasharray={`${Math.PI * r * 0.6} ${Math.PI * 2 * r}`} />
    </svg>
  );
  return label ? (
    <span className="fk-spinner-wrap">
      {svg}
      <span>{label}</span>
    </span>
  ) : (
    svg
  );
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand' | 'inverse';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconRight?: string;
  loading?: boolean;
  block?: boolean;
  href?: string;
}

/** Button — acción pill. Una sola primaria por vista. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', icon, iconRight, loading, block, href, className, children, type = 'button', ...rest },
  ref,
) {
  const cls = cx('fk-btn', `fk-btn--${variant}`, size !== 'md' && `fk-btn--${size}`, block && 'fk-btn--block', loading && 'fk-btn--loading', className);
  const isz = size === 'sm' ? 16 : 18;
  const inner = (
    <>
      {icon && <Icon name={icon} size={isz} />}
      {children != null && <span>{children}</span>}
      {iconRight && <Icon name={iconRight} size={isz} />}
      {loading && (
        <span className="fk-btn__spin">
          <Spinner size={isz} label="" />
        </span>
      )}
    </>
  );
  if (href) {
    return (
      <Link className={cls} href={href}>
        {inner}
      </Link>
    );
  }
  return (
    <button ref={ref} type={type} className={cls} aria-busy={loading || undefined} disabled={rest.disabled || loading} {...rest}>
      {inner}
    </button>
  );
});

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  badge,
  className,
  ...rest
}: { icon: string; label: string; variant?: 'ghost' | 'secondary' | 'inverse' | 'primary'; size?: 'sm' | 'md' | 'lg'; badge?: number | boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const isz = size === 'sm' ? 16 : size === 'lg' ? 22 : 20;
  return (
    <button type="button" aria-label={label} title={label} className={cx('fk-iconbtn', variant !== 'ghost' && `fk-iconbtn--${variant}`, size !== 'md' && `fk-iconbtn--${size}`, className)} {...rest}>
      <Icon name={icon} size={isz} />
      {badge === true && <span className="fk-iconbtn__badge fk-iconbtn__badge--dot" />}
      {typeof badge === 'number' && badge > 0 && <span className="fk-iconbtn__badge">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx('fk-link', className)}>
      {children}
    </Link>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('fk-mono', className)}>{children}</span>;
}
