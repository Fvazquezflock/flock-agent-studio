'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Icon, IconButton, cx } from './core';

export type Tone = 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'neutral';
const TONE_ICON: Record<string, string> = { info: 'info', success: 'check-circle', warning: 'alert-triangle', danger: 'alert-circle', brand: 'sparkles' };

export function Alert({ tone = 'info', title, children, actions, onClose, banner, className }: { tone?: Exclude<Tone, 'neutral'>; title?: ReactNode; children?: ReactNode; actions?: ReactNode; onClose?: () => void; banner?: boolean; className?: string }) {
  return (
    <div className={cx('fk-alert', tone !== 'info' && `fk-alert--${tone}`, banner && 'fk-alert--banner', className)} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={TONE_ICON[tone]} size={20} className="fk-alert__icon" />
      <div className="fk-alert__body">
        {title && <span className="fk-alert__title">{title}</span>}
        {children && <span className="fk-alert__text">{children}</span>}
        {actions && <div className="fk-alert__actions">{actions}</div>}
      </div>
      {onClose && <IconButton icon="x" label="Cerrar aviso" size="sm" className="fk-alert__close" onClick={onClose} />}
    </div>
  );
}

/** Estado de un registro: siempre punto + palabra. */
export function StatusBadge({ tone = 'neutral', children, size = 'md' }: { tone?: Tone; children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span className={cx('fk-status', tone !== 'neutral' && `fk-status--${tone}`, size === 'sm' && 'fk-status--sm')}>
      <span className="fk-status__dot" />
      {children}
    </span>
  );
}

export function Tag({ children, icon, variant, size = 'md', onClick, selected }: { children: ReactNode; icon?: string; variant?: 'brand'; size?: 'sm' | 'md'; onClick?: () => void; selected?: boolean }) {
  const selectable = !!onClick || selected !== undefined;
  const El = selectable ? 'button' : 'span';
  return (
    <El
      type={selectable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={selectable ? !!selected : undefined}
      className={cx('fk-tag', selectable && 'fk-tag--selectable', variant === 'brand' && 'fk-tag--brand', size === 'sm' && 'fk-tag--sm')}
    >
      {icon && <Icon name={icon} size={14} />}
      {children}
    </El>
  );
}

export function EmptyState({ icon = 'inbox', title, children, actions, compact }: { icon?: string; title?: ReactNode; children?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  return (
    <div className={cx('fk-empty', compact && 'fk-empty--compact')}>
      <span className="fk-empty__icon">
        <Icon name={icon} size={compact ? 20 : 24} />
      </span>
      {title && <h3 className="fk-h3">{title}</h3>}
      {children && <p className="fk-empty__text">{children}</p>}
      {actions && <div className="fk-empty__actions">{actions}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="fk-skel-lines" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className="fk-skel fk-skel--text" style={{ width: i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function ProgressBar({ value, label, tone = 'primary', indeterminate }: { value: number; label?: string; tone?: 'primary' | 'success' | 'warning' | 'danger'; indeterminate?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('fk-progress', tone !== 'primary' && `fk-progress--${tone}`, indeterminate && 'fk-progress--indeterminate')}>
      {label && (
        <div className="fk-progress__top">
          <span>{label}</span>
          {!indeterminate && <span className="fk-progress__pct">{Math.round(v)}%</span>}
        </div>
      )}
      <div className="fk-progress__track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : v} aria-label={label}>
        <div className="fk-progress__fill" style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

export function EnvBadge({ env }: { env: 'dev' | 'test' | 'uat' | 'prod' }) {
  return (
    <span className={cx('fk-env', `fk-env--${env}`)} title={`Ambiente ${env.toUpperCase()}`}>
      <span className="fk-env__dot" />
      {env === 'dev' ? 'LOCAL' : env.toUpperCase()}
    </span>
  );
}

// ---------- Toasts ----------

interface ToastItem {
  id: number;
  tone: 'success' | 'warning' | 'danger' | 'info';
  title: string;
  text?: string;
}
const ToastCtx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Date.now() + Math.random();
    setItems((xs) => [...xs, { ...t, id }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), t.tone === 'danger' ? 9000 : 5000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fk-toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('fk-toast', `fk-toast--${t.tone === 'info' ? 'success' : t.tone}`)} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <Icon name={TONE_ICON[t.tone]} size={20} className="fk-toast__icon" />
            <div className="fk-toast__body">
              <span className="fk-toast__title">{t.title}</span>
              {t.text && <span className="fk-toast__text">{t.text}</span>}
            </div>
            <IconButton icon="x" label="Cerrar" size="sm" className="fk-toast__close" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
