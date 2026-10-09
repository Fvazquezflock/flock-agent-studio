'use client';

import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Icon, cx } from './core';

export function FormField({ label, required, optional, hint, error, children, className }: { label?: ReactNode; required?: boolean; optional?: boolean; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  const id = useId().replace(/:/g, '');
  const child = isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string }>, { id: (children as ReactElement<{ id?: string }>).props.id ?? id }) : children;
  return (
    <div className={cx('fk-field', className)}>
      {label && (
        <label className="fk-field__label" htmlFor={id}>
          {label}
          {required && <span className="fk-field__req" aria-hidden="true">*</span>}
          {optional && <span className="fk-field__opt">(opcional)</span>}
        </label>
      )}
      {child}
      {error ? (
        <p className="fk-field__error">
          <Icon name="alert-circle" size={14} />
          {error}
        </p>
      ) : hint ? (
        <p className="fk-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> & { onChange?: (v: string) => void; icon?: string; invalid?: boolean; size?: 'sm' | 'md'; mono?: boolean };

export function TextInput({ value, onChange, icon, invalid, size = 'md', className, mono, disabled, readOnly, ...rest }: InputProps) {
  return (
    <div className={cx('fk-control', size !== 'md' && `fk-control--${size}`, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled', readOnly && 'fk-control--readonly', className)}>
      {icon && (
        <span className="fk-control__affix">
          <Icon name={icon} size={size === 'sm' ? 16 : 18} />
        </span>
      )}
      <input value={value ?? ''} disabled={disabled} readOnly={readOnly} aria-invalid={invalid || undefined} onChange={(e) => onChange?.(e.target.value)} className={mono ? 'fk-mono' : undefined} {...rest} />
    </div>
  );
}

export function Textarea({ value, onChange, rows = 4, invalid, className, mono, ...rest }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & { onChange?: (v: string) => void; invalid?: boolean; mono?: boolean }) {
  return (
    <div className={cx('fk-control', 'fk-control--multiline', invalid && 'fk-control--invalid', className)} style={{ flexDirection: 'column' }}>
      <textarea rows={rows} value={value ?? ''} aria-invalid={invalid || undefined} onChange={(e) => onChange?.(e.target.value)} className={mono ? 'fk-mono' : undefined} style={mono ? { fontSize: 12.5, lineHeight: '18px' } : undefined} {...rest} />
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** Select nativo con el estilo de control del design system (accesible por defecto). */
export function Select({ value, onChange, options, placeholder, size = 'md', disabled, id, className }: { value: string; onChange: (v: string) => void; options: (Option | string)[]; placeholder?: string; size?: 'sm' | 'md'; disabled?: boolean; id?: string; className?: string }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <span className={cx('fk-control', size !== 'md' && `fk-control--${size}`, disabled && 'fk-control--disabled', className)} style={{ position: 'relative' }}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={{ border: 0, background: 'transparent', font: 'inherit', color: 'inherit', width: '100%', cursor: 'pointer', outline: 0, appearance: 'none', paddingRight: 22 }}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" size={16} className="fk-control__chev" style={{ position: 'absolute', right: 12, pointerEvents: 'none' }} />
    </span>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled }: { label?: ReactNode; description?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="fk-check">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="fk-check__box">
        <Icon name="check" size={13} strokeWidth={3} />
      </span>
      {(label || description) && (
        <span className="fk-check__body">
          {label && <span>{label}</span>}
          {description && <span className="fk-check__desc">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({ label, checked, onChange, disabled }: { label?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="fk-switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="fk-switch__track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function SegmentedControl({ options, value, onChange, label, size = 'md' }: { options: Option[]; value: string; onChange: (v: string) => void; label: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cx('fk-seg', size === 'sm' && 'fk-seg--sm')} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" className="fk-seg__item" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Lista de opciones con checkbox (selección múltiple). */
export function CheckList({ options, value, onChange, columns = 2 }: { options: (Option & { description?: string })[]; value: string[]; onChange: (v: string[]) => void; columns?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <Checkbox
          key={o.value}
          label={o.label}
          description={o.description}
          checked={value.includes(o.value)}
          onChange={(c) => onChange(c ? [...value, o.value] : value.filter((x) => x !== o.value))}
        />
      ))}
    </div>
  );
}

/** Lista editable de textos (una línea por elemento). */
export function LinesInput({ value, onChange, rows = 4, placeholder }: { value: string[]; onChange: (v: string[]) => void; rows?: number; placeholder?: string }) {
  return (
    <Textarea
      rows={rows}
      value={value.join('\n')}
      placeholder={placeholder ?? 'Un elemento por línea'}
      onChange={(t) => onChange(t.split('\n').map((l) => l.trimEnd()).filter((l, i, a) => l.trim() || i < a.length - 1))}
      onBlur={() => onChange(value.map((l) => l.trim()).filter(Boolean))}
    />
  );
}
