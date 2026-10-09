import { cx, Icon, Popup, useControllable, useUid, fmtMoney, parseAR, fmtDate, sameDay, MONTHS, DOW, monthMatrix } from './core.jsx';
import { Button, IconButton } from './actions.jsx';
const { useState, useRef, useMemo, useEffect } = React;

const normOpts = (options = []) => options.map((o) => (typeof o === 'string' || typeof o === 'number' ? { value: o, label: String(o) } : o));
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** FormField — label, required mark, hint and error around one control. */
export function FormField({ label, required, optional, hint, error, htmlFor, inline, className, children }) {
  const auto = useUid('f');
  const id = htmlFor || auto;
  const child = React.isValidElement(children) && typeof children.type !== 'string'
    ? React.cloneElement(children, { id: children.props.id || id, invalid: children.props.invalid ?? !!error, 'aria-describedby': (hint || error) ? id + '-d' : undefined })
    : children;
  return (
    <div className={cx('fk-field', inline && 'fk-field--inline', className)}>
      {label && <label className="fk-field__label" htmlFor={id}>{label}{required && <span className="fk-field__req" aria-hidden="true">*</span>}{optional && <span className="fk-field__opt">(opcional)</span>}</label>}
      {child}
      {error ? <p className="fk-field__error" id={id + '-d'}><Icon name="alert-circle" size={14} />{error}</p>
        : hint ? <p className="fk-field__hint" id={id + '-d'}>{hint}</p> : null}
    </div>
  );
}

/** TextInput — single-line text with optional icon, prefix/suffix and clear. */
export function TextInput({ value, defaultValue = '', onChange, icon, prefix, suffix, clearable, size = 'md', invalid, disabled, readOnly, pill, className, maxLength, showCount, ...rest }) {
  const [v, setV] = useControllable(value, defaultValue, undefined);
  const change = (nv, e) => { setV(nv); onChange && onChange(nv, e); };
  return (
    <div className={cx('fk-control', size !== 'md' && 'fk-control--' + size, pill && 'fk-control--pill', invalid && 'fk-control--invalid', disabled && 'fk-control--disabled', readOnly && 'fk-control--readonly', className)}>
      {icon && <span className="fk-control__affix"><Icon name={icon} size={size === 'sm' ? 16 : 18} /></span>}
      {prefix && <span className="fk-control__affix">{prefix}</span>}
      <input value={v} disabled={disabled} readOnly={readOnly} aria-invalid={invalid || undefined} maxLength={maxLength} onChange={(e) => change(e.target.value, e)} {...rest} />
      {clearable && v && !disabled && <button type="button" className="fk-control__clear" aria-label="Limpiar" onClick={() => change('')}><Icon name="x" size={14} /></button>}
      {showCount && maxLength && <span className="fk-control__affix fk-num" style={{ fontSize: 12 }}>{String(v).length}/{maxLength}</span>}
      {suffix && <span className="fk-control__affix">{suffix}</span>}
    </div>
  );
}

/** Textarea — multi-line text with optional character count. */
export function Textarea({ value, defaultValue = '', onChange, rows = 3, maxLength, invalid, disabled, className, ...rest }) {
  const [v, setV] = useControllable(value, defaultValue, undefined);
  return (
    <div className={cx('fk-control', 'fk-control--multiline', invalid && 'fk-control--invalid', disabled && 'fk-control--disabled', className)} style={{ flexDirection: 'column' }}>
      <textarea rows={rows} value={v} maxLength={maxLength} disabled={disabled} aria-invalid={invalid || undefined}
        onChange={(e) => { setV(e.target.value); onChange && onChange(e.target.value, e); }} {...rest} />
      {maxLength && <span className="fk-control__count fk-num">{String(v).length}/{maxLength}</span>}
    </div>
  );
}

function highlight(label, q) {
  if (!q) return label;
  const i = norm(label).indexOf(norm(q));
  if (i < 0) return label;
  return <>{label.slice(0, i)}<mark>{label.slice(i, i + q.length)}</mark>{label.slice(i + q.length)}</>;
}

function Listbox({ options, active, setActive, isSelected, onPick, query, multi, empty = 'Sin resultados', id }) {
  let lastGroup;
  return (
    <ul className="fk-listbox" role="listbox" id={id} aria-multiselectable={multi || undefined}>
      {options.length === 0 && <li className="fk-listbox__empty">{empty}</li>}
      {options.map((o, i) => {
        const g = o.group && o.group !== lastGroup ? (lastGroup = o.group) : null;
        const sel = isSelected(o);
        return (
          <React.Fragment key={String(o.value)}>
            {g && <li className="fk-listbox__group" role="presentation">{g}</li>}
            <li role="option" aria-selected={sel} aria-disabled={o.disabled || undefined} data-active={i === active}
              className="fk-listbox__opt" onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); if (!o.disabled) onPick(o); }}>
              {multi && <span className="fk-check" style={{ pointerEvents: 'none' }}><span className="fk-check__box" style={sel ? { background: 'var(--primary)', borderColor: 'var(--primary)' } : null}>{sel && <Icon name="check" size={13} strokeWidth={3} style={{ opacity: 1 }} />}</span></span>}
              {o.icon && <Icon name={o.icon} size={16} />}
              <span style={{ minWidth: 0 }}>{highlight(o.label, query)}{o.description && <span className="fk-listbox__desc">{o.description}</span>}</span>
              {!multi && sel && <Icon name="check" size={16} className="fk-listbox__check" />}
            </li>
          </React.Fragment>
        );
      })}
    </ul>
  );
}

function useListNav(count, onEnter) {
  const [active, setActive] = useState(-1);
  const onKeyDown = (e, open, setOpen) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(count - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && open && active >= 0) { e.preventDefault(); onEnter(active); }
    else if (e.key === 'Escape') setOpen(false);
  };
  return [active, setActive, onKeyDown];
}

/** Select — pick one option from a closed list. */
export function Select({ options, value, defaultValue = null, onChange, placeholder = 'Elegí una opción', size = 'md', invalid, disabled, defaultOpen = false, id, className, ...rest }) {
  const opts = normOpts(options);
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [open, setOpen] = useState(defaultOpen);
  const sel = opts.find((o) => o.value === v);
  const pick = (o) => { setV(o.value); setOpen(false); };
  const [active, setActive, onKeyDown] = useListNav(opts.length, (i) => pick(opts[i]));
  return (
    <Popup open={open} onClose={() => setOpen(false)} block className={className}
      trigger={
        <button type="button" id={id} disabled={disabled} aria-haspopup="listbox" aria-expanded={open}
          className={cx('fk-control', 'fk-control--button', size !== 'md' && 'fk-control--' + size, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled')}
          onClick={() => setOpen(!open)} onKeyDown={(e) => onKeyDown(e, open, setOpen)} {...rest}>
          {sel && sel.icon && <Icon name={sel.icon} size={16} />}
          <span className={cx('fk-control__value', !sel && 'fk-control__value--placeholder')}>{sel ? sel.label : placeholder}</span>
          <Icon name="chevron-down" size={16} className="fk-control__chev" />
        </button>}>
      <Listbox options={opts} active={active} setActive={setActive} isSelected={(o) => o.value === v} onPick={pick} />
    </Popup>
  );
}

/** Combobox — searchable single select for long lists. */
export function Combobox({ options, value, defaultValue = null, onChange, placeholder = 'Buscar…', icon = 'search', size = 'md', invalid, disabled, defaultOpen = false, defaultQuery, emptyText, id, className }) {
  const opts = normOpts(options);
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const sel = opts.find((o) => o.value === v);
  const [q, setQ] = useState(defaultQuery ?? (sel ? sel.label : ''));
  const [open, setOpen] = useState(defaultOpen);
  const filtered = useMemo(() => (!q || (sel && q === sel.label) ? opts : opts.filter((o) => norm(o.label).includes(norm(q)))), [q, opts, sel]);
  const pick = (o) => { setV(o.value); setQ(o.label); setOpen(false); };
  const [active, setActive, onKeyDown] = useListNav(filtered.length, (i) => pick(filtered[i]));
  return (
    <Popup open={open} onClose={() => setOpen(false)} block className={className}
      trigger={
        <div className={cx('fk-control', size !== 'md' && 'fk-control--' + size, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled')} aria-expanded={open}>
          {icon && <span className="fk-control__affix"><Icon name={icon} size={16} /></span>}
          <input id={id} role="combobox" aria-expanded={open} aria-autocomplete="list" value={q} placeholder={placeholder} disabled={disabled}
            onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={(e) => onKeyDown(e, open, setOpen)} />
          {q && <button type="button" className="fk-control__clear" aria-label="Limpiar" onClick={() => { setQ(''); setV(null); }}><Icon name="x" size={14} /></button>}
          <Icon name="chevron-down" size={16} className="fk-control__chev" />
        </div>}>
      <Listbox options={filtered} active={active} setActive={setActive} isSelected={(o) => o.value === v} onPick={pick} query={sel && q === sel.label ? '' : q} empty={emptyText} />
    </Popup>
  );
}

/** MultiSelect — several options shown as removable chips. */
export function MultiSelect({ options, value, defaultValue = [], onChange, placeholder = 'Elegí una o más', size = 'md', invalid, disabled, defaultOpen = false, maxChips = 3, id, className }) {
  const opts = normOpts(options);
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(defaultOpen);
  const filtered = opts.filter((o) => !q || norm(o.label).includes(norm(q)));
  const toggle = (o) => setV(v.includes(o.value) ? v.filter((x) => x !== o.value) : [...v, o.value]);
  const [active, setActive, onKeyDown] = useListNav(filtered.length, (i) => toggle(filtered[i]));
  const chosen = opts.filter((o) => v.includes(o.value));
  return (
    <Popup open={open} onClose={() => setOpen(false)} block className={className}
      trigger={
        <div className={cx('fk-control', 'fk-control--multi', size !== 'md' && 'fk-control--' + size, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled')} onClick={() => setOpen(true)}>
          {chosen.slice(0, maxChips).map((o) => (
            <span key={o.value} className="fk-chip"><span>{o.label}</span>
              <button type="button" className="fk-chip__remove" aria-label={'Quitar ' + o.label} onClick={(e) => { e.stopPropagation(); toggle(o); }}><Icon name="x" size={12} /></button>
            </span>))}
          {chosen.length > maxChips && <span className="fk-chip fk-chip--static">+{chosen.length - maxChips}</span>}
          <input id={id} role="combobox" aria-expanded={open} value={q} placeholder={chosen.length ? '' : placeholder} disabled={disabled}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }} onKeyDown={(e) => { if (e.key === 'Backspace' && !q && v.length) setV(v.slice(0, -1)); onKeyDown(e, open, setOpen); }} />
          <Icon name="chevron-down" size={16} className="fk-control__chev" />
        </div>}>
      <Listbox options={filtered} active={active} setActive={setActive} isSelected={(o) => v.includes(o.value)} onPick={toggle} query={q} multi />
    </Popup>
  );
}

/** Checkbox — one option on/off; supports indeterminate. */
export function Checkbox({ label, description, checked, defaultChecked = false, indeterminate, onChange, disabled, className, id, ...rest }) {
  const [c, setC] = useControllable(checked, defaultChecked, onChange);
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = !!indeterminate; }, [indeterminate]);
  return (
    <label className={cx('fk-check', className)}>
      <input ref={ref} type="checkbox" id={id} checked={!!c} disabled={disabled} onChange={(e) => setC(e.target.checked)} {...rest} />
      <span className="fk-check__box"><Icon name={indeterminate ? 'minus' : 'check'} size={13} strokeWidth={3} /></span>
      {(label || description) && <span className="fk-check__body">{label && <span>{label}</span>}{description && <span className="fk-check__desc">{description}</span>}</span>}
    </label>
  );
}

/** CheckboxGroup — several independent options under one legend. */
export function CheckboxGroup({ legend, options, value, defaultValue = [], onChange, row }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  return (
    <fieldset className={cx('fk-group', row && 'fk-group--row')}>
      {legend && <legend className="fk-group__legend">{legend}</legend>}
      {normOpts(options).map((o) => <Checkbox key={o.value} label={o.label} description={o.description} disabled={o.disabled} checked={v.includes(o.value)} onChange={(c) => setV(c ? [...v, o.value] : v.filter((x) => x !== o.value))} />)}
    </fieldset>
  );
}

/** RadioGroup — exactly one option among a few. */
export function RadioGroup({ legend, options, value, defaultValue, onChange, row, cards, name }) {
  const auto = useUid('r');
  const [v, setV] = useControllable(value, defaultValue, onChange);
  return (
    <fieldset className={cx('fk-group', row && 'fk-group--row')} role="radiogroup">
      {legend && <legend className="fk-group__legend">{legend}</legend>}
      <div className={cards ? 'fk-radio-cards' : 'fk-group' + (row ? ' fk-group--row' : '')}>
        {normOpts(options).map((o) => (
          <label key={o.value} className={cx('fk-check', 'fk-check--radio', cards && 'fk-radio-card')}>
            <input type="radio" name={name || auto} checked={v === o.value} disabled={o.disabled} onChange={() => setV(o.value)} />
            <span className="fk-check__box"><span className="fk-check__dot" /></span>
            <span className="fk-check__body"><span>{o.label}</span>{o.description && <span className="fk-check__desc">{o.description}</span>}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Switch — instant on/off setting. */
export function Switch({ label, checked, defaultChecked = false, onChange, disabled, size = 'md', id }) {
  const [c, setC] = useControllable(checked, defaultChecked, onChange);
  return (
    <label className={cx('fk-switch', size === 'sm' && 'fk-switch--sm')}>
      <input type="checkbox" role="switch" id={id} checked={!!c} disabled={disabled} onChange={(e) => setC(e.target.checked)} />
      <span className="fk-switch__track" />
      {label && <span>{label}</span>}
    </label>
  );
}

/** MiniCalendar — month grid used by DatePicker. */
export function MiniCalendar({ value, range, onPick, month: m0, minDate, maxDate, today = new Date() }) {
  const base = m0 || (range ? value && value.from : value) || today;
  const [view, setView] = useState({ y: base.getFullYear(), m: base.getMonth() });
  const days = monthMatrix(view.y, view.m);
  const move = (d) => setView(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  const from = range ? value && value.from : value, to = range ? value && value.to : null;
  return (
    <div className="fk-cal">
      <div className="fk-cal__head">
        <IconButton icon="chevron-left" label="Mes anterior" size="sm" onClick={() => move(-1)} />
        <span className="fk-cal__title">{MONTHS[view.m]} {view.y}</span>
        <IconButton icon="chevron-right" label="Mes siguiente" size="sm" onClick={() => move(1)} />
      </div>
      <div className="fk-cal__grid" role="grid">
        {DOW.map((d, i) => <span key={i} className="fk-cal__dow">{d}</span>)}
        {days.map((d) => {
          const out = d.getMonth() !== view.m;
          const isSel = sameDay(d, from) || sameDay(d, to);
          const inRange = range && from && to && d > from && d < to;
          const dis = (minDate && d < minDate) || (maxDate && d > maxDate);
          return (
            <button key={d.toISOString()} type="button" disabled={dis} aria-pressed={isSel}
              className={cx('fk-cal__day', out && 'fk-cal__day--out', sameDay(d, today) && 'fk-cal__day--today', isSel && 'fk-cal__day--sel', inRange && 'fk-cal__day--range')}
              onClick={() => onPick(d)}>{d.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}

const PRESETS = () => {
  const t = new Date(); const d = (y, m, dd) => new Date(y, m, dd);
  return [
    { label: 'Últimos 7 días', from: d(t.getFullYear(), t.getMonth(), t.getDate() - 6), to: d(t.getFullYear(), t.getMonth(), t.getDate()) },
    { label: 'Este mes', from: d(t.getFullYear(), t.getMonth(), 1), to: d(t.getFullYear(), t.getMonth() + 1, 0) },
    { label: 'Mes anterior', from: d(t.getFullYear(), t.getMonth() - 1, 1), to: d(t.getFullYear(), t.getMonth(), 0) },
  ];
};

/** DatePicker — single date or range, dd/mm/aaaa. */
export function DatePicker({ value, defaultValue = null, onChange, range, placeholder, presets = true, size = 'md', invalid, disabled, defaultOpen = false, minDate, maxDate, id, className }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(null);
  const text = range ? (v && v.from ? fmtDate(v.from) + ' – ' + (v.to ? fmtDate(v.to) : '…') : '') : fmtDate(v);
  const pick = (d) => {
    if (!range) { setV(d); setOpen(false); return; }
    const cur = draft || v || {};
    if (!cur.from || cur.to) { const n = { from: d, to: null }; setDraft(n); setV(n); }
    else { const n = d < cur.from ? { from: d, to: cur.from } : { from: cur.from, to: d }; setDraft(null); setV(n); }
  };
  return (
    <Popup open={open} onClose={() => setOpen(false)} block className={className}
      trigger={
        <button type="button" id={id} disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
          className={cx('fk-control', 'fk-control--button', size !== 'md' && 'fk-control--' + size, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled')} onClick={() => setOpen(!open)}>
          <span className="fk-control__affix"><Icon name={range ? 'calendar-range' : 'calendar'} size={16} /></span>
          <span className={cx('fk-control__value', !text && 'fk-control__value--placeholder', 'fk-num')}>{text || placeholder || (range ? 'dd/mm/aaaa – dd/mm/aaaa' : 'dd/mm/aaaa')}</span>
        </button>}>
      <div>
        <MiniCalendar value={v} range={range} onPick={pick} minDate={minDate} maxDate={maxDate} />
        {range && presets && (
          <div className="fk-cal__foot" style={{ margin: '0 14px 14px', flexWrap: 'wrap', justifyContent: 'flex-start' }}>
            {PRESETS().map((p) => <button key={p.label} type="button" className="fk-tag fk-tag--selectable" onClick={() => { setV({ from: p.from, to: p.to }); setOpen(false); }}>{p.label}</button>)}
          </div>
        )}
      </div>
    </Popup>
  );
}

/** NumberInput — numbers and amounts with Argentine format (1.234,56). */
export function NumberInput({ value, defaultValue = null, onChange, currency, decimals = 2, prefix, suffix, size = 'md', invalid, disabled, placeholder = '0,00', min, max, id, className }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [editing, setEditing] = useState(null);
  const shown = editing !== null ? editing : (v === null || v === undefined ? '' : fmtMoney(v, { currency: false, decimals }));
  const commit = () => { let n = parseAR(editing); if (n !== null) { if (min !== undefined) n = Math.max(min, n); if (max !== undefined) n = Math.min(max, n); } setV(n); setEditing(null); };
  return (
    <div className={cx('fk-control', 'fk-control--num', size !== 'md' && 'fk-control--' + size, invalid && 'fk-control--invalid', disabled && 'fk-control--disabled', className)}>
      {(currency || prefix) && <span className="fk-control__affix">{prefix || '$'}</span>}
      <input id={id} inputMode="decimal" value={shown} placeholder={placeholder} disabled={disabled} aria-invalid={invalid || undefined}
        onFocus={() => setEditing(v === null || v === undefined ? '' : String(v).replace('.', ','))}
        onChange={(e) => setEditing(e.target.value.replace(/[^\d,.-]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {suffix && <span className="fk-control__affix">{suffix}</span>}
    </div>
  );
}

/** SearchField — pill search box with clear and optional shortcut hint. */
export function SearchField({ value, defaultValue = '', onChange, onSearch, placeholder = 'Buscar', shortcut, size = 'md', className, invalid, ...rest }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  return (
    <div className={cx('fk-control', 'fk-control--pill', size !== 'md' && 'fk-control--' + size, className)} role="search">
      <span className="fk-control__affix"><Icon name="search" size={size === 'sm' ? 16 : 18} /></span>
      <input type="search" value={v} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onSearch && onSearch(v)} {...rest} />
      {v ? <button type="button" className="fk-control__clear" aria-label="Limpiar búsqueda" onClick={() => setV('')}><Icon name="x" size={14} /></button>
        : shortcut && <span className="fk-kbds">{shortcut.split('+').map((k) => <kbd key={k} className="fk-kbd">{k}</kbd>)}</span>}
    </div>
  );
}

const fmtSize = (b) => (b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB');

/** FileUpload — drop zone plus the list of attached files. */
export function FileUpload({ files, defaultFiles = [], onFiles, onRemove, accept, multiple = true, hint = 'Excel, PDF o imágenes · hasta 10 MB', disabled }) {
  const [list, setList] = useControllable(files, defaultFiles, undefined);
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const add = (fl) => { const arr = Array.from(fl || []).map((f) => ({ name: f.name, size: f.size, progress: 100 })); onFiles && onFiles(fl); setList([...(list || []), ...arr]); };
  return (
    <div>
      <div className={cx('fk-drop', over && 'fk-drop--over')} role="button" tabIndex={0} aria-disabled={disabled}
        onClick={() => input.current && input.current.click()} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <span className="fk-drop__icon"><Icon name="upload" size={20} /></span>
        <span>Arrastrá archivos acá o <span className="fk-link">elegilos desde tu equipo</span></span>
        {hint && <span className="fk-drop__hint">{hint}</span>}
        <input ref={input} type="file" hidden accept={accept} multiple={multiple} onChange={(e) => add(e.target.files)} />
      </div>
      {list && list.length > 0 && (
        <ul className="fk-files">
          {list.map((f, i) => (
            <li key={i} className={cx('fk-file', f.error && 'fk-file--error')}>
              <Icon name={/\.(xlsx?|csv)$/i.test(f.name) ? 'file-spreadsheet' : 'file'} size={20} className="fk-file__icon" />
              <div className="fk-file__body">
                <span className="fk-file__name">{f.name}</span>
                {f.progress < 100 && !f.error && <div className="fk-progress fk-progress--sm"><div className="fk-progress__track"><div className="fk-progress__fill" style={{ width: f.progress + '%' }} /></div></div>}
                <span className="fk-file__meta">{f.error ? f.error : f.progress < 100 ? `Subiendo… ${f.progress}%` : fmtSize(f.size || 0)}</span>
              </div>
              <IconButton icon={f.error ? 'refresh' : 'trash'} label={f.error ? 'Reintentar' : 'Quitar archivo'} size="sm" onClick={() => { onRemove && onRemove(f, i); setList(list.filter((_, j) => j !== i)); }} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** TimePicker — time of day in 24 h, from a list every `step` minutes. */
export function TimePicker({ value, defaultValue = null, onChange, step = 30, from = '08:00', to = '20:00', placeholder = 'hh:mm', ...rest }) {
  const opts = useMemo(() => {
    const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
    const out = []; for (let t = fh * 60 + fm; t <= th * 60 + tm; t += step) out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    return out;
  }, [step, from, to]);
  return <Combobox options={opts} value={value} defaultValue={defaultValue} onChange={onChange} placeholder={placeholder} icon="clock" {...rest} />;
}

/** Slider — numeric value or range on a track. */
export function Slider({ label, min = 0, max = 100, step = 1, value, defaultValue, onChange, format = (n) => n, showScale = true, id }) {
  const [v, setV] = useControllable(value, defaultValue ?? min, onChange);
  const isRange = Array.isArray(v);
  const pct = (n) => ((n - min) / (max - min)) * 100;
  const a = isRange ? v[0] : min, b = isRange ? v[1] : v;
  return (
    <div className="fk-slider">
      {label && <div className="fk-slider__top"><label htmlFor={id}>{label}</label><span className="fk-slider__value">{isRange ? `${format(a)} – ${format(b)}` : format(b)}</span></div>}
      <div className="fk-slider__track">
        <div className="fk-slider__rail" />
        <div className="fk-slider__fill" style={{ left: pct(a) + '%', width: pct(b) - pct(a) + '%' }} />
        {isRange && <input type="range" aria-label={(label || '') + ' mínimo'} min={min} max={max} step={step} value={a} onChange={(e) => setV([Math.min(+e.target.value, b), b])} />}
        <input type="range" id={id} aria-label={isRange ? (label || '') + ' máximo' : label} min={min} max={max} step={step} value={b} onChange={(e) => setV(isRange ? [a, Math.max(+e.target.value, a)] : +e.target.value)} />
      </div>
      {showScale && <div className="fk-slider__scale"><span>{format(min)}</span><span>{format(max)}</span></div>}
    </div>
  );
}

/** FormLayout — vertical stack of FormSections. */
export function FormLayout({ children, onSubmit, className }) {
  return <form className={cx('fk-form', className)} onSubmit={(e) => { e.preventDefault(); onSubmit && onSubmit(e); }} noValidate>{children}</form>;
}
/** FormSection — titled group of fields in a 1–3 column grid. */
export function FormSection({ title, description, columns = 2, stacked, children }) {
  return (
    <section className={cx('fk-fsec', stacked && 'fk-fsec--stacked')}>
      {(title || description) && <div className="fk-fsec__head">{title && <h3 className="fk-h3">{title}</h3>}{description && <p className="fk-fsec__desc">{description}</p>}</div>}
      <div className="fk-fsec__body" style={{ '--fk-cols': columns }}>{children}</div>
    </section>
  );
}
/** FormActions — save / cancel bar, optionally sticky. */
export function FormActions({ children, note, sticky }) {
  return <div className={cx('fk-factions', sticky && 'fk-factions--sticky')}>{note && <span className="fk-factions__note"><Icon name="info" size={14} />{note}</span>}{children}</div>;
}
