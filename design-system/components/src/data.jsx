import { cx, Icon, Popup, useControllable, sameDay, MONTHS, monthMatrix, fmtDate, parseDate } from './core.jsx';
import { Button, IconButton, DropdownMenu, Menu } from './actions.jsx';
import { Checkbox, RadioGroup, SearchField, TextInput, NumberInput, Select, MiniCalendar } from './forms.jsx';
import { Drawer } from './containers.jsx';
import { Skeleton, Tag } from './feedback.jsx';
import { Avatar } from './people.jsx';
const { useState, useMemo, useRef } = React;

const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** FilterDropdown — pill that opens a checklist (or single choice) to filter by one dimension. */
export function FilterDropdown({ label, options = [], value, defaultValue = [], onChange, multiple = true, searchable, defaultOpen = false, placement = 'start' }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(v);
  const [q, setQ] = useState('');
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const shown = opts.filter((o) => !q || norm(o.label).includes(norm(q)));
  const sel = opts.filter((o) => (v || []).includes(o.value));
  const openIt = () => { setDraft(v || []); setOpen(!open); };
  const apply = (d) => { setV(d); setOpen(false); };
  return (
    <Popup open={open} onClose={() => setOpen(false)} placement={placement}
      trigger={
        <button type="button" className={cx('fk-fpill', sel.length > 0 && 'fk-fpill--active')} aria-haspopup="dialog" aria-expanded={open} onClick={openIt}>
          <span>{label}</span>
          {sel.length > 0 && <span className="fk-fpill__value">{sel[0].label}{sel.length > 1 ? ` +${sel.length - 1}` : ''}</span>}
          <Icon name="chevron-down" size={14} className="fk-control__chev" />
        </button>}>
      <div className="fk-fpanel" role="dialog" aria-label={'Filtrar por ' + label}>
        {(searchable ?? opts.length > 7) && <div className="fk-fpanel__search"><SearchField size="sm" placeholder={'Buscar ' + label.toLowerCase()} value={q} onChange={setQ} /></div>}
        <div className="fk-fpanel__list">
          {multiple ? shown.map((o) => (
            <div key={o.value} style={{ display: 'flex', alignItems: 'center' }}>
              <Checkbox label={o.label} checked={draft.includes(o.value)} onChange={(c) => setDraft(c ? [...draft, o.value] : draft.filter((x) => x !== o.value))} />
              {o.count !== undefined && <span className="fk-fpanel__count">{o.count}</span>}
            </div>))
            : <RadioGroup options={shown} value={draft[0]} onChange={(x) => setDraft([x])} />}
          {shown.length === 0 && <span className="fk-listbox__empty">Sin resultados</span>}
        </div>
        <div className="fk-fpanel__foot">
          <Button size="sm" variant="ghost" onClick={() => apply([])}>Limpiar</Button>
          <Button size="sm" onClick={() => apply(draft)}>Aplicar</Button>
        </div>
      </div>
    </Popup>
  );
}

/** FilterChip — an active filter, removable. */
export function FilterChip({ label, value, onRemove }) {
  return (
    <span className="fk-chip">
      {label && <span className="fk-chip__key">{label}:</span>}<span>{value}</span>
      {onRemove && <button type="button" className="fk-chip__remove" aria-label={`Quitar filtro ${label || ''} ${value}`} onClick={onRemove}><Icon name="x" size={12} /></button>}
    </span>
  );
}

/** FilterBar — search + quick filter pills + active chips above a table. */
export function FilterBar({ search = true, searchPlaceholder = 'Buscar', searchValue, onSearchChange, filters = [], value, defaultValue = {}, onChange, onMoreFilters, moreCount, actions }) {
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const chips = filters.flatMap((f) => (v[f.key] || []).map((val) => {
    const o = (f.options || []).map((x) => (typeof x === 'string' ? { value: x, label: x } : x)).find((x) => x.value === val);
    return { key: f.key, label: f.label, value: val, text: o ? o.label : val };
  }));
  return (
    <div className="fk-filterbar">
      <div className="fk-filterbar__row">
        {search && <div className="fk-filterbar__search"><SearchField size="sm" placeholder={searchPlaceholder} value={searchValue} onChange={onSearchChange} /></div>}
        {filters.map((f) => <FilterDropdown key={f.key} {...f} value={v[f.key] || []} onChange={(nv) => setV({ ...v, [f.key]: nv })} />)}
        {onMoreFilters && <Button size="sm" variant="ghost" icon="sliders" onClick={onMoreFilters}>Más filtros{moreCount ? ` (${moreCount})` : ''}</Button>}
        <span className="fk-filterbar__spacer" />
        {actions}
      </div>
      {chips.length > 0 && (
        <div className="fk-filterbar__chips">
          <span className="fk-filterbar__chips-label">Filtros activos</span>
          {chips.map((c) => <FilterChip key={c.key + c.value} label={c.label} value={c.text} onRemove={() => setV({ ...v, [c.key]: v[c.key].filter((x) => x !== c.value) })} />)}
          <button type="button" className="fk-link" style={{ fontSize: 13, marginLeft: 6 }} onClick={() => setV({})}>Limpiar filtros</button>
        </div>
      )}
    </div>
  );
}

/** FilterGrid — filter form laid out in a grid above a list, with Buscar / Limpiar. */
export function FilterGrid({ title = 'Filtros', columns = 4, children, more, defaultExpanded = false, onSearch, onClear, activeCount, variant = 'default', searchLabel = 'Buscar' }) {
  const [exp, setExp] = useState(defaultExpanded);
  return (
    <form className={cx('fk-fgrid', variant === 'subtle' && 'fk-fgrid--subtle')} onSubmit={(e) => { e.preventDefault(); onSearch && onSearch(); }} role="search">
      <div className="fk-fgrid__head">
        <span className="fk-fgrid__title"><Icon name="filter" size={18} />{title}</span>
        {activeCount > 0 && <span className="fk-status fk-status--brand fk-status--sm">{activeCount} activos</span>}
      </div>
      <div className="fk-fgrid__fields" style={{ '--fk-cols': columns }}>
        {children}
        {exp && more}
      </div>
      <div className="fk-fgrid__foot">
        {more && <Button size="sm" variant="ghost" className="fk-fgrid__more" iconRight={exp ? 'chevron-up' : 'chevron-down'} onClick={() => setExp(!exp)}>{exp ? 'Menos filtros' : 'Más filtros'}</Button>}
        {!more && <span style={{ marginRight: 'auto' }} />}
        <Button variant="ghost" onClick={onClear}>Limpiar</Button>
        <Button type="submit" icon="search">{searchLabel}</Button>
      </div>
    </form>
  );
}

/** FilterPanel — drawer with every filter criterion (advanced filters). */
export function FilterPanel({ open = true, onClose, title = 'Filtros avanzados', activeCount, children, onApply, onClear, inline }) {
  return (
    <Drawer open={open} onClose={onClose} inline={inline} title={title} description={activeCount ? `${activeCount} filtros activos` : 'Combiná criterios para acotar la lista.'}
      footer={<><Button variant="ghost" onClick={onClear} style={{ marginRight: 'auto' }}>Limpiar todo</Button><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={onApply}>Aplicar filtros</Button></>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>{children}</div>
    </Drawer>
  );
}

const cmp = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true }));

/* ───────── Column filters (data-table filters) ───────── */
const TEXT_OPS = [{ value: 'contains', label: 'Contiene' }, { value: 'starts', label: 'Empieza con' }, { value: 'equals', label: 'Es igual a' }, { value: 'not', label: 'No contiene' }];
const nfAR = (n) => Number(n).toLocaleString('es-AR');
const cellValue = (c, r) => (c.filter && c.filter.value ? c.filter.value(r) : r[c.key]);
const toDate = (v) => (v instanceof Date ? v : typeof v === 'string' ? (parseDate(v) || (isNaN(Date.parse(v)) ? null : new Date(v))) : null);
const dayOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function isFilterActive(type, v) {
  if (v === undefined || v === null) return false;
  if (type === 'text') return !!(v.q && String(v.q).trim());
  if (type === 'multi') return Array.isArray(v) && v.length > 0;
  if (type === 'number') return (v.min !== null && v.min !== undefined) || (v.max !== null && v.max !== undefined);
  if (type === 'date') return !!(v.from || v.to);
  return v !== '';
}
function matchFilter(type, cell, v) {
  if (!isFilterActive(type, v)) return true;
  if (type === 'text') {
    const a = norm(cell ?? ''), q = norm(v.q.trim());
    return v.op === 'starts' ? a.startsWith(q) : v.op === 'equals' ? a === q : v.op === 'not' ? !a.includes(q) : a.includes(q);
  }
  if (type === 'select') return String(cell) === String(v);
  if (type === 'multi') return v.includes(String(cell));
  if (type === 'number') { const n = Number(cell); return (v.min == null || n >= v.min) && (v.max == null || n <= v.max); }
  if (type === 'date') { const d = toDate(cell); if (!d) return false; const t = dayOf(d); return (!v.from || t >= dayOf(v.from)) && (!v.to || t <= dayOf(v.to)); }
  return true;
}
function optionsFor(column, rows) {
  const f = column.filter || {};
  const counts = {};
  rows.forEach((r) => { const k = String(cellValue(column, r)); counts[k] = (counts[k] || 0) + 1; });
  const base = f.options ? f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : { ...o, value: String(o.value) }))
    : Object.keys(counts).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).map((k) => ({ value: k, label: k }));
  return base.map((o) => ({ ...o, count: o.count ?? counts[o.value] ?? 0 }));
}
export function filterSummary(column, v, rows = []) {
  const type = column.filter && column.filter.type;
  if (type === 'text') return `${(TEXT_OPS.find((o) => o.value === (v.op || 'contains')) || TEXT_OPS[0]).label.toLowerCase()} “${v.q}”`;
  if (type === 'select' || type === 'multi') {
    const opts = optionsFor(column, rows); const vals = type === 'multi' ? v : [v];
    const lab = (x) => (opts.find((o) => o.value === String(x)) || { label: x }).label;
    return lab(vals[0]) + (vals.length > 1 ? ` +${vals.length - 1}` : '');
  }
  if (type === 'number') return v.min != null && v.max != null ? `${nfAR(v.min)} – ${nfAR(v.max)}` : v.min != null ? `≥ ${nfAR(v.min)}` : `≤ ${nfAR(v.max)}`;
  if (type === 'date') return v.from && v.to ? `${fmtDate(v.from)} – ${fmtDate(v.to)}` : v.from ? `desde ${fmtDate(v.from)}` : `hasta ${fmtDate(v.to)}`;
  return String(v);
}
const emptyFor = (type) => (type === 'text' ? { op: 'contains', q: '' } : type === 'multi' ? [] : type === 'number' ? { min: null, max: null } : type === 'date' ? { from: null, to: null } : null);

/** ColumnFilter — the filter of one DataTable column: an icon in the header (or a field in the filter row) that opens a panel. */
export function ColumnFilter({ column, value, onChange, rows = [], variant = 'icon', defaultOpen = false, placement }) {
  const f = column.filter || {}; const type = f.type || 'text';
  const [open, setOpen] = useState(defaultOpen);
  const [draft, setDraft] = useState(value ?? emptyFor(type));
  const [q, setQ] = useState('');
  const active = isFilterActive(type, value);
  const header = typeof column.header === 'string' ? column.header : column.key;
  const toggle = () => { setDraft(value ?? emptyFor(type)); setQ(''); setOpen(!open); };
  const apply = (v) => { onChange && onChange(isFilterActive(type, v) ? v : undefined); setOpen(false); };
  const opts = type === 'select' || type === 'multi' ? optionsFor(column, rows) : [];
  const shown = opts.filter((o) => !q || norm(o.label).includes(norm(q)));
  let body = null;
  if (type === 'text') body = (
    <div className="fk-colfilter__stack">
      <Select size="sm" options={TEXT_OPS} value={draft.op || 'contains'} onChange={(op) => setDraft({ ...draft, op })} aria-label="Condición" />
      <TextInput size="sm" autoFocus placeholder={f.placeholder || 'Escribí un valor'} value={draft.q} onChange={(x) => setDraft({ ...draft, q: x })} onKeyDown={(e) => e.key === 'Enter' && apply(draft)} clearable />
    </div>);
  if (type === 'number') body = (
    <div className="fk-colfilter__pair">
      <FormFieldMini label="Desde"><NumberInput size="sm" decimals={f.decimals ?? 0} currency={f.currency} placeholder="Mín." value={draft.min} onChange={(n) => setDraft({ ...draft, min: n })} /></FormFieldMini>
      <FormFieldMini label="Hasta"><NumberInput size="sm" decimals={f.decimals ?? 0} currency={f.currency} placeholder="Máx." value={draft.max} onChange={(n) => setDraft({ ...draft, max: n })} /></FormFieldMini>
    </div>);
  if (type === 'date') body = (
    <div className="fk-colfilter__cal">
      <MiniCalendar range value={draft} onPick={(d) => setDraft(!draft.from || draft.to ? { from: d, to: null } : d < draft.from ? { from: d, to: draft.from } : { from: draft.from, to: d })} />
      <span className="fk-colfilter__hint fk-num">{draft.from ? fmtDate(draft.from) + ' – ' + (draft.to ? fmtDate(draft.to) : '…') : 'Elegí desde y hasta'}</span>
    </div>);
  if (type === 'select' || type === 'multi') body = (
    <>
      {(f.searchable ?? opts.length > 7) && <div className="fk-colfilter__search"><SearchField size="sm" placeholder="Buscar valor" value={q} onChange={setQ} /></div>}
      <div className="fk-fpanel__list">
        {type === 'multi' && shown.length > 1 && <div className="fk-colfilter__all"><Checkbox label="Seleccionar todo" checked={shown.every((o) => draft.includes(o.value))} indeterminate={shown.some((o) => draft.includes(o.value)) && !shown.every((o) => draft.includes(o.value))} onChange={(c) => setDraft(c ? Array.from(new Set([...draft, ...shown.map((o) => o.value)])) : draft.filter((x) => !shown.some((o) => o.value === x)))} /></div>}
        {shown.map((o) => (
          <div key={o.value} className="fk-colfilter__opt">
            {type === 'multi'
              ? <Checkbox label={o.label} checked={draft.includes(o.value)} onChange={(c) => setDraft(c ? [...draft, o.value] : draft.filter((x) => x !== o.value))} />
              : <label className="fk-check fk-check--radio"><input type="radio" name={'cf-' + column.key} checked={String(draft) === o.value} onChange={() => setDraft(o.value)} /><span className="fk-check__box"><span className="fk-check__dot" /></span><span>{o.label}</span></label>}
            <span className="fk-fpanel__count">{o.count}</span>
          </div>
        ))}
        {shown.length === 0 && <span className="fk-listbox__empty">Sin resultados</span>}
      </div>
    </>);
  const trigger = variant === 'field'
    ? <button type="button" className={cx('fk-control', 'fk-control--sm', 'fk-control--button', 'fk-colfilter__field', active && 'fk-colfilter__field--active')} aria-haspopup="dialog" aria-expanded={open} onClick={toggle} aria-label={'Filtrar ' + header}>
        <span className={cx('fk-control__value', !active && 'fk-control__value--placeholder')}>{active ? filterSummary(column, value, rows) : 'Todos'}</span>
        <Icon name={type === 'date' ? 'calendar' : 'chevron-down'} size={14} className="fk-control__chev" />
      </button>
    : <button type="button" className={cx('fk-colfilter__btn', active && 'fk-colfilter__btn--active')} aria-haspopup="dialog" aria-expanded={open} onClick={(e) => { e.stopPropagation(); toggle(); }}
        aria-label={(active ? 'Filtro activo en ' : 'Filtrar ') + header} title={active ? 'Filtro: ' + filterSummary(column, value, rows) : 'Filtrar ' + header}>
        <Icon name="filter" size={14} />{active && <span className="fk-colfilter__dot" />}
      </button>;
  return (
    <Popup fixed open={open} onClose={() => setOpen(false)} placement={placement || (column.align === 'right' ? 'end' : 'start')} className={variant === 'field' ? 'fk-anchor--block' : undefined} trigger={trigger}>
      <div className={cx('fk-fpanel', 'fk-colfilter', type === 'date' && 'fk-colfilter--wide')} role="dialog" aria-label={'Filtrar ' + header} onClick={(e) => e.stopPropagation()}>
        <div className="fk-colfilter__head">Filtrar: <b>{header}</b></div>
        {body}
        <div className="fk-fpanel__foot">
          <Button size="sm" variant="ghost" onClick={() => apply(emptyFor(type))}>Limpiar</Button>
          <Button size="sm" onClick={() => apply(draft)}>Aplicar</Button>
        </div>
      </div>
    </Popup>
  );
}
function FormFieldMini({ label, children }) { return <label className="fk-field"><span className="fk-field__label">{label}</span>{children}</label>; }

/** DataTable — the data grid: sorting, column filters, selection, row actions, density, sticky header. */
export function DataTable({ columns = [], rows = [], rowKey = 'id', selectable, selected, defaultSelected = [], onSelectionChange, sort, defaultSort = null, onSortChange,
  filters, defaultFilters = {}, onFiltersChange, filterMode = 'menu', manualFilters, showFilterSummary = true,
  density = 'normal', striped, rowActions, onRowClick, loading, loadingRows = 5, empty, toolbar, footer, maxHeight, caption, className }) {
  const [sel, setSel] = useControllable(selected, defaultSelected, onSelectionChange);
  const [s, setS] = useControllable(sort, defaultSort, onSortChange);
  const [flt, setFlt] = useControllable(filters, defaultFilters, onFiltersChange);
  const filterable = columns.filter((c) => c.filter);
  const activeCols = filterable.filter((c) => isFilterActive(c.filter.type || 'text', flt[c.key]));
  const setOne = (k, v) => { const n = { ...flt }; if (v === undefined) delete n[k]; else n[k] = v; setFlt(n); };
  const filtered = useMemo(() => (manualFilters || activeCols.length === 0 ? rows : rows.filter((r) => activeCols.every((c) => matchFilter(c.filter.type || 'text', cellValue(c, r), flt[c.key])))), [rows, flt, manualFilters, columns]);
  const data = useMemo(() => {
    if (!s || onSortChange) return filtered;
    const col = columns.find((c) => c.key === s.key);
    const get = col && col.sortValue ? col.sortValue : (r) => r[s.key];
    return [...filtered].sort((a, b) => cmp(get(a), get(b)) * (s.dir === 'desc' ? -1 : 1));
  }, [filtered, s, columns, onSortChange]);
  const ids = data.map((r) => r[rowKey]);
  const all = ids.length > 0 && ids.every((id) => sel.includes(id));
  const some = !all && ids.some((id) => sel.includes(id));
  const toggleSort = (k) => setS(!s || s.key !== k ? { key: k, dir: 'asc' } : s.dir === 'asc' ? { key: k, dir: 'desc' } : null);
  const alignCls = (c, p) => (c.align === 'right' ? p + '--num' : c.align === 'center' ? p + '--center' : null);
  const span = columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  const rowFilterCell = (c) => {
    if (!c.filter) return null;
    const type = c.filter.type || 'text';
    if (type === 'text') return <TextInput size="sm" icon="search" placeholder={c.filter.placeholder || 'Filtrar'} value={(flt[c.key] && flt[c.key].q) || ''} onChange={(q) => setOne(c.key, q ? { op: 'contains', q } : undefined)} clearable aria-label={'Filtrar ' + (typeof c.header === 'string' ? c.header : c.key)} />;
    if (type === 'select') return <Select size="sm" options={[{ value: '__all', label: 'Todos' }, ...optionsFor(c, rows).map((o) => ({ value: o.value, label: o.label }))]} value={flt[c.key] ?? '__all'} onChange={(v) => setOne(c.key, v === '__all' ? undefined : v)} aria-label={'Filtrar ' + c.header} />;
    return <ColumnFilter variant="field" column={c} rows={rows} value={flt[c.key]} onChange={(v) => setOne(c.key, v)} />;
  };
  return (
    <div className={cx('fk-tablebox', className)}>
      {toolbar}
      {showFilterSummary && activeCols.length > 0 && (
        <div className="fk-tfilters" role="status">
          <span className="fk-filterbar__chips-label">Filtros de columna</span>
          {activeCols.map((c) => <FilterChip key={c.key} label={typeof c.header === 'string' ? c.header : c.key} value={filterSummary(c, flt[c.key], rows)} onRemove={() => setOne(c.key, undefined)} />)}
          <button type="button" className="fk-link" style={{ fontSize: 13 }} onClick={() => setFlt({})}>Limpiar filtros</button>
          {!manualFilters && <span className="fk-tfilters__count fk-num">Mostrando {nfAR(data.length)} de {nfAR(rows.length)}</span>}
        </div>
      )}
      <div className="fk-tablescroll" style={maxHeight ? { maxHeight } : undefined}>
        <table className={cx('fk-table', density === 'compact' && 'fk-table--compact', striped && 'fk-table--striped', onRowClick && 'fk-table--clickable')}>
          {caption && <caption className="fk-sr">{caption}</caption>}
          <thead>
            <tr>
              {selectable && <th className="fk-th--check"><Checkbox aria-label="Seleccionar todo" checked={all} indeterminate={some} onChange={(c) => setSel(c ? Array.from(new Set([...sel, ...ids])) : sel.filter((x) => !ids.includes(x)))} /></th>}
              {columns.map((c) => {
                const sorted = s && s.key === c.key;
                const label = c.sortable ? <button type="button" className="fk-sort" aria-sort={sorted ? s.dir : undefined} onClick={() => toggleSort(c.key)}>{c.header}<Icon name={sorted ? (s.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'arrow-up-down'} size={14} /></button> : c.header;
                return (
                  <th key={c.key} className={cx(alignCls(c, 'fk-th'), c.sticky && 'fk-th--sticky', sorted && 'fk-th--sorted')} style={{ width: c.width, minWidth: c.minWidth }} aria-sort={sorted ? (s.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    {c.filter && filterMode === 'menu' ? <span className="fk-th__inner">{label}<ColumnFilter column={c} rows={rows} value={flt[c.key]} defaultOpen={c.filter.defaultOpen} onChange={(v) => setOne(c.key, v)} /></span> : label}
                  </th>
                );
              })}
              {rowActions && <th className="fk-td--actions"><span className="fk-sr">Acciones</span></th>}
            </tr>
            {filterMode === 'row' && filterable.length > 0 && (
              <tr className="fk-table__filters">
                {selectable && <th />}
                {columns.map((c) => <th key={c.key} className={cx(c.sticky && 'fk-th--sticky')}>{rowFilterCell(c)}</th>)}
                {rowActions && <th className="fk-td--actions">{activeCols.length > 0 && <IconButton icon="x" label="Limpiar filtros de columna" size="sm" onClick={() => setFlt({})} />}</th>}
              </tr>
            )}
          </thead>
          <tbody>
            {loading && Array.from({ length: loadingRows }, (_, i) => (
              <tr key={'sk' + i}>{selectable && <td className="fk-td--check"><Skeleton width={18} height={18} radius={5} /></td>}{columns.map((c, j) => <td key={c.key}><Skeleton width={j === 0 ? '70%' : '50%'} /></td>)}{rowActions && <td />}</tr>
            ))}
            {!loading && data.length === 0 && <tr className="fk-table__empty"><td colSpan={span}>{activeCols.length > 0 && rows.length > 0
              ? <div className="fk-empty fk-empty--compact"><span className="fk-empty__icon"><Icon name="search" size={20} /></span><h3 className="fk-h3">Sin resultados</h3><p className="fk-empty__text">Ningún registro coincide con los filtros de columna.</p><div className="fk-empty__actions"><Button variant="secondary" size="sm" onClick={() => setFlt({})}>Limpiar filtros</Button></div></div>
              : empty || <div className="fk-listbox__empty" style={{ padding: 40 }}>No hay registros para mostrar.</div>}</td></tr>}
            {!loading && data.map((r) => {
              const id = r[rowKey], isSel = sel.includes(id);
              return (
                <tr key={id} aria-selected={selectable ? isSel : undefined} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                  {selectable && <td className="fk-td--check" onClick={(e) => e.stopPropagation()}><Checkbox aria-label={'Seleccionar fila ' + id} checked={isSel} onChange={(c) => setSel(c ? [...sel, id] : sel.filter((x) => x !== id))} /></td>}
                  {columns.map((c) => (
                    <td key={c.key} className={cx(alignCls(c, 'fk-td'), c.sticky && 'fk-td--sticky', c.wrap && 'fk-td--wrap')}>
                      {c.render ? c.render(r) : c.sub ? <span className="fk-table__primary"><span>{r[c.key]}</span><span className="fk-table__sub">{r[c.sub]}</span></span> : r[c.key]}
                    </td>
                  ))}
                  {rowActions && <td className="fk-td--actions" onClick={(e) => e.stopPropagation()}><DropdownMenu fixed placement="end" items={rowActions(r)} trigger={<IconButton icon="more-horizontal" label="Acciones de la fila" size="sm" />} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer && <div className="fk-tablebox__foot">{footer}</div>}
    </div>
  );
}

/** TableToolbar — title, count, search, columns, density and export above a DataTable. */
export function TableToolbar({ title, count, search, searchPlaceholder = 'Buscar en la tabla', onSearchChange, columns, onColumnsChange, density, onDensityChange, actions, selectedCount = 0, bulkActions, onClearSelection }) {
  if (selectedCount > 0) {
    return (
      <div className="fk-ttool fk-ttool--selected">
        <span className="fk-ttool__title"><span className="fk-h4">{selectedCount} {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}</span><button type="button" className="fk-link" style={{ fontSize: 13 }} onClick={onClearSelection}>Deseleccionar</button></span>
        {bulkActions}
      </div>
    );
  }
  return (
    <div className="fk-ttool">
      <span className="fk-ttool__title">{title && <span className="fk-h4">{title}</span>}{count !== undefined && <span className="fk-ttool__count">{Number(count).toLocaleString('es-AR')} registros</span>}</span>
      {search && <div className="fk-ttool__search"><SearchField size="sm" placeholder={searchPlaceholder} onChange={onSearchChange} /></div>}
      {columns && <DropdownMenu placement="end" closeOnSelect={false} trigger={<Button size="sm" variant="secondary" icon="columns">Columnas</Button>}
        items={[{ type: 'label', label: 'Columnas visibles' }, ...columns.map((c) => ({ label: c.label, checked: c.visible !== false, onSelect: () => onColumnsChange && onColumnsChange(columns.map((x) => (x.key === c.key ? { ...x, visible: x.visible === false } : x))) }))]} />}
      {onDensityChange && <IconButton icon={density === 'compact' ? 'list' : 'layers'} label={density === 'compact' ? 'Densidad normal' : 'Densidad compacta'} size="sm" variant="secondary" onClick={() => onDensityChange(density === 'compact' ? 'normal' : 'compact')} />}
      {actions}
    </div>
  );
}

/** SavedViews — named combinations of filters, like tabs. */
export function SavedViews({ views = [], value, defaultValue, onChange, onSave, onAction }) {
  const [v, setV] = useControllable(value, defaultValue ?? (views[0] && views[0].id), onChange);
  return (
    <div className="fk-views" role="group" aria-label="Vistas guardadas">
      {views.map((x) => (
        <button key={x.id} type="button" className="fk-view" aria-pressed={v === x.id} onClick={() => setV(x.id)}>
          {x.default && <Icon name="star" size={14} className="fk-view__star" />}{x.label}{x.count !== undefined && <span className="fk-view__count">{x.count}</span>}
        </button>
      ))}
      {onSave && <Button size="sm" variant="ghost" icon="plus" onClick={onSave}>Guardar vista</Button>}
      <DropdownMenu placement="end" trigger={<IconButton icon="more-horizontal" label="Opciones de la vista" size="sm" />}
        items={[{ label: 'Renombrar vista', icon: 'edit' }, { label: 'Duplicar', icon: 'copy' }, { label: 'Marcar como predeterminada', icon: 'star' }, { type: 'separator' }, { label: 'Eliminar vista', icon: 'trash', danger: true }].map((i) => ({ ...i, onSelect: () => onAction && onAction(i.label, v) }))} />
    </div>
  );
}

/** DescriptionList — key–value detail of a record. */
export function DescriptionList({ items = [], columns = 2, variant = 'grid' }) {
  return (
    <dl className={cx('fk-dl', variant === 'rows' && 'fk-dl--rows')} style={{ '--fk-cols': columns }}>
      {items.map((it, i) => (
        <div key={i} className="fk-dl__item" style={it.span ? { gridColumn: `span ${it.span}` } : undefined}>
          <dt>{it.label}</dt>
          <dd>{it.value === undefined || it.value === null || it.value === '' ? <span className="fk-dl__empty">—</span> : it.value}{it.copy}</dd>
        </div>
      ))}
    </dl>
  );
}

/** List — simple rows with leading icon/avatar, meta and trailing content. */
export function List({ items = [], interactive }) {
  return (
    <ul className={cx('fk-list', interactive && 'fk-list--interactive')}>
      {items.map((it, i) => (
        <li key={i} className="fk-list__item" onClick={it.onClick} tabIndex={interactive ? 0 : undefined}>
          {it.avatar && <span className="fk-list__lead"><Avatar name={it.avatar} /></span>}
          {it.icon && <span className="fk-list__lead fk-list__lead--icon"><Icon name={it.icon} size={18} /></span>}
          <div className="fk-list__body"><span className="fk-list__title">{it.title}</span>{it.meta && <span className="fk-list__meta">{it.meta}</span>}</div>
          {it.trailing && <span className="fk-list__trail">{it.trailing}</span>}
          {interactive && <Icon name="chevron-right" size={16} style={{ color: 'var(--ink-subtle)' }} />}
        </li>
      ))}
    </ul>
  );
}

function Sparkline({ data = [], width = 96, height = 32 }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), rng = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * (width - 4) + 2, height - 3 - ((d - min) / rng) * (height - 6)]);
  return (
    <svg className="fk-stat__spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill="currentColor" />
    </svg>
  );
}

/** StatCard — KPI with variation and sparkline. */
export function StatCard({ label, value, delta, deltaLabel = 'vs. mes anterior', icon, spark, variant = 'default', invert }) {
  const dir = delta === undefined || delta === 0 ? 'flat' : delta > 0 ? 'up' : 'down';
  const good = invert ? dir === 'down' : dir === 'up';
  const cls = dir === 'flat' ? 'flat' : good ? 'up' : 'down';
  return (
    <div className={cx('fk-stat', variant === 'brand' && 'fk-stat--brand')}>
      <div className="fk-stat__top"><span>{label}</span>{icon && <span className="fk-stat__icon"><Icon name={icon} size={16} /></span>}</div>
      <span className="fk-stat__value">{value}</span>
      <div className="fk-stat__bottom">
        {delta !== undefined && <span className={cx('fk-stat__delta', variant !== 'brand' && 'fk-stat__delta--' + cls)}><Icon name={dir === 'flat' ? 'arrow-right' : dir === 'up' ? 'trending-up' : 'trending-down'} size={14} />{(delta > 0 ? '+' : '') + String(delta).replace('.', ',')}%</span>}
        <span>{deltaLabel}</span>
        {spark && <Sparkline data={spark} />}
      </div>
    </div>
  );
}

const defFmt = (n) => Number(n).toLocaleString('es-AR');
const niceMax = (m) => { if (m <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(m))); const f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const barPath = (x, y, w, h, r = 4) => { const rr = Math.min(r, w / 2, h); return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`; };

/** Chart — bar, line and donut charts with the brand palette, legend and hover tooltips. */
export function Chart({ type = 'bar', title, subtitle, categories = [], series = [], height = 240, format = defFmt, centerLabel = 'Total', showTable }) {
  const [hover, setHover] = useState(null);
  const box = useRef(null);
  const [W, setW] = useState(640);
  React.useEffect(() => {
    if (!box.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => { const w = Math.round(e.contentRect.width); if (w > 0) setW(w); });
    ro.observe(box.current); return () => ro.disconnect();
  }, []);
  const H = height, padL = 56, padR = 12, padT = 12, padB = 28;
  const cls = (i) => 'fk-c' + Math.min(i + 1, 5);
  const legend = type === 'donut' ? categories.map((c, i) => ({ name: c, i })) : series.map((s, i) => ({ name: s.name, i }));
  const tipAt = (e, content) => { const r = box.current.getBoundingClientRect(); setHover({ x: e.clientX - r.left, y: e.clientY - r.top, content }); };

  let body = null;
  if (type === 'donut') {
    const data = series[0] ? series[0].data : [];
    const total = data.reduce((a, b) => a + b, 0) || 1;
    const R = Math.min(H / 2 - 8, 110), r0 = R * 0.62, cx0 = W / 2, cy0 = H / 2;
    let a0 = -Math.PI / 2;
    body = (
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
        {data.map((d, i) => {
          const a1 = a0 + (d / total) * Math.PI * 2, large = a1 - a0 > Math.PI ? 1 : 0;
          const p = (a, rad) => [cx0 + Math.cos(a) * rad, cy0 + Math.sin(a) * rad];
          const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r0), [x3, y3] = p(a0, r0);
          const path = `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
          a0 = a1;
          return <path key={i} d={path} className={cx('fk-chart__arc', cls(i), hover && hover.i === i && 'is-hover')}
            onMouseMove={(e) => tipAt(e, { i, title: categories[i], rows: [[i, format(d) + ' · ' + Math.round((d / total) * 100) + '%']] })} onMouseLeave={() => setHover(null)} />;
        })}
        <text x={cx0} y={cy0 + 4} textAnchor="middle" className="fk-chart__center">{format(total)}</text>
        <text x={cx0} y={cy0 + 22} textAnchor="middle" className="fk-chart__centersub">{centerLabel}</text>
      </svg>
    );
  } else {
    const max = niceMax(Math.max(1, ...series.flatMap((s) => s.data)));
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
    const iw = W - padL - padR, ih = H - padT - padB, n = categories.length || 1, band = iw / n;
    const y = (v) => padT + ih - (v / max) * ih;
    const grid = (
      <g>
        {ticks.map((t, i) => <g key={i}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className={i === 0 ? 'fk-chart__baseline' : 'fk-chart__grid'} /><text x={padL - 8} y={y(t) + 4} textAnchor="end" className="fk-chart__axis">{format(t)}</text></g>)}
        {categories.map((c, i) => { const max = Math.max(3, Math.floor(band / 6.4)); const lab = c.length > max ? c.slice(0, max - 1) + '…' : c; return <text key={c} x={padL + band * i + band / 2} y={H - 8} textAnchor="middle" className="fk-chart__axis"><title>{c}</title>{lab}</text>; })}
      </g>
    );
    if (type === 'bar') {
      const k = series.length, gw = band * 0.62, bw = Math.max(4, (gw - (k - 1) * 2) / k);
      body = (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {grid}
          {categories.map((c, ci) => series.map((s, si) => {
            const v = s.data[ci] || 0, x = padL + band * ci + (band - gw) / 2 + si * (bw + 2), h = ih - (y(v) - padT);
            const key = ci + '-' + si;
            return <path key={key} d={barPath(x, y(v), bw, Math.max(0, h))} className={cx('fk-chart__bar', cls(si), hover && hover.key === key && 'is-hover')} style={{ stroke: 'none' }}
              onMouseMove={(e) => tipAt(e, { key, title: c, rows: [[si, s.name + ': ' + format(v)]] })} onMouseLeave={() => setHover(null)} />;
          }))}
        </svg>
      );
    } else {
      const xAt = (i) => padL + band * i + band / 2;
      const idx = hover && hover.idx;
      body = (
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}
          onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - r.left) / r.width) * W; const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band))); tipAt(e, { idx: i, title: categories[i], rows: series.map((s, si) => [si, s.name + ': ' + format(s.data[i])]) }); }}
          onMouseLeave={() => setHover(null)}>
          {grid}
          {idx !== undefined && idx !== null && <line x1={xAt(idx)} x2={xAt(idx)} y1={padT} y2={padT + ih} className="fk-chart__cross" />}
          {series.map((s, si) => <path key={si} d={s.data.map((v, i) => (i ? 'L' : 'M') + xAt(i) + ',' + y(v)).join(' ')} className={cx('fk-chart__line', cls(si))} />)}
          {idx !== undefined && idx !== null && series.map((s, si) => <circle key={si} cx={xAt(idx)} cy={y(s.data[idx])} r="4.5" className={cx('fk-chart__dot', cls(si))} style={{ stroke: 'var(--surface)' }} />)}
        </svg>
      );
    }
  }
  return (
    <div className={cx('fk-chart', hover && 'fk-chart--hovering')} ref={box}>
      {(title || legend.length > 1) && (
        <div className="fk-chart__head">
          <div>{title && <h3 className="fk-chart__title">{title}</h3>}{subtitle && <p className="fk-chart__sub">{subtitle}</p>}</div>
          {legend.length > 1 && <ul className="fk-chart__legend">{legend.map((l) => <li key={l.name}><span className={cx('fk-chart__key', cls(l.i))} />{l.name}</li>)}</ul>}
        </div>
      )}
      {body}
      {hover && <div className="fk-chart__tip" style={{ left: hover.x, top: hover.y }}><b>{hover.content.title}</b>{hover.content.rows.map(([i, t]) => <div key={i} className="fk-chart__tiprow"><span className={cx('fk-chart__key', cls(i))} />{t}</div>)}</div>}
      {showTable && (
        <table className="fk-chart__table"><thead><tr><th>{type === 'donut' ? 'Categoría' : ''}</th>{type === 'donut' ? <th>Valor</th> : series.map((s) => <th key={s.name}>{s.name}</th>)}</tr></thead>
          <tbody>{categories.map((c, i) => <tr key={c}><td>{c}</td>{type === 'donut' ? <td>{format(series[0].data[i])}</td> : series.map((s) => <td key={s.name}>{format(s.data[i])}</td>)}</tr>)}</tbody></table>
      )}
    </div>
  );
}

/** Timeline — activity / audit history of a record. */
export function Timeline({ items = [] }) {
  return (
    <ol className="fk-timeline">
      {items.map((it, i) => (
        <li key={i} className="fk-tl">
          <span className={cx('fk-tl__dot', it.tone && 'fk-tl__dot--' + it.tone)}><Icon name={it.icon || 'circle-dot'} size={14} /></span>
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

function TreeNode({ node, level, expanded, toggle, selected, onSelect }) {
  const kids = node.children && node.children.length > 0;
  const open = expanded.has(node.id);
  return (
    <li role="treeitem" aria-expanded={kids ? open : undefined} aria-selected={selected === node.id}>
      <button type="button" className="fk-tree__row" aria-expanded={kids ? open : undefined} aria-selected={selected === node.id} onClick={() => { if (kids) toggle(node.id); onSelect && onSelect(node.id, node); }}>
        {kids ? <span className="fk-tree__toggle"><Icon name="chevron-right" size={14} /></span> : <span className="fk-tree__spacer" />}
        <Icon name={node.icon || (kids ? (open ? 'folder-open' : 'folder') : 'file')} size={16} className="fk-tree__icon" />
        <span>{node.label}</span>
        {node.meta && <span className="fk-tree__meta">{node.meta}</span>}
      </button>
      {kids && open && <ul role="group">{node.children.map((c) => <TreeNode key={c.id} node={c} level={level + 1} expanded={expanded} toggle={toggle} selected={selected} onSelect={onSelect} />)}</ul>}
    </li>
  );
}
/** TreeView — expandable hierarchy (organization, modules, folders). */
export function TreeView({ data = [], defaultExpanded = [], selected, defaultSelected = null, onSelect }) {
  const [expanded, setExpanded] = useState(() => new Set(defaultExpanded));
  const [sel, setSel] = useControllable(selected, defaultSelected, undefined);
  const toggle = (id) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return <ul className="fk-tree" role="tree">{data.map((n) => <TreeNode key={n.id} node={n} level={0} expanded={expanded} toggle={toggle} selected={sel} onSelect={(id, node) => { setSel(id); onSelect && onSelect(id, node); }} />)}</ul>;
}

/** KanbanBoard — columns of cards by state; drag a card to move it. */
export function KanbanBoard({ columns = [], onMove }) {
  const [cols, setCols] = useState(columns);
  const [drag, setDrag] = useState(null);
  const move = (cardId, toCol) => {
    setCols((cs) => { let card; const without = cs.map((c) => ({ ...c, cards: c.cards.filter((k) => (k.id === cardId ? ((card = k), false) : true)) })); return without.map((c) => (c.id === toCol && card ? { ...c, cards: [...c.cards, card] } : c)); });
    onMove && onMove(cardId, toCol);
  };
  return (
    <div className="fk-kanban">
      {cols.map((c) => (
        <section key={c.id} className="fk-kcol" onDragOver={(e) => e.preventDefault()} onDrop={() => drag && move(drag, c.id)} aria-label={c.title}>
          <div className="fk-kcol__head"><span className="fk-kcol__dot" style={{ background: c.color || 'var(--border-strong)' }} /><span>{c.title}</span><span className="fk-kcol__count">{c.cards.length}</span><IconButton icon="plus" label={'Agregar en ' + c.title} size="sm" className="fk-kcol__add" /></div>
          {c.cards.map((k) => (
            <article key={k.id} className="fk-kcard" draggable onDragStart={() => setDrag(k.id)} onDragEnd={() => setDrag(null)}>
              {k.code && <span className="fk-kcard__id">{k.code}</span>}
              <span className="fk-kcard__title">{k.title}</span>
              {k.tags && <span className="fk-kcard__tags">{k.tags.map((t) => <Tag key={t} size="sm">{t}</Tag>)}</span>}
              <span className="fk-kcard__foot">{k.due && <><Icon name="calendar" size={14} />{k.due}</>}{k.comments ? <><Icon name="message" size={14} />{k.comments}</> : null}{k.assignee && <Avatar name={k.assignee} size="xs" />}</span>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}

/** Calendar — month view with events. */
export function Calendar({ year, month, events = [], today = new Date(), maxPerDay = 3, onEventClick }) {
  const [view, setView] = useState({ y: year ?? today.getFullYear(), m: month ?? today.getMonth() });
  const days = monthMatrix(view.y, view.m);
  const go = (d) => setView(({ y, m }) => { const n = new Date(y, m + d, 1); return { y: n.getFullYear(), m: n.getMonth() }; });
  return (
    <div className="fk-month">
      <div className="fk-month__head">
        <span className="fk-month__title">{MONTHS[view.m]} {view.y}</span>
        <Button size="sm" variant="secondary" onClick={() => setView({ y: today.getFullYear(), m: today.getMonth() })}>Hoy</Button>
        <IconButton icon="chevron-left" label="Mes anterior" size="sm" onClick={() => go(-1)} />
        <IconButton icon="chevron-right" label="Mes siguiente" size="sm" onClick={() => go(1)} />
      </div>
      <div className="fk-month__grid">
        {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d) => <span key={d} className="fk-month__dow">{d}</span>)}
        {days.map((d) => {
          const evs = events.filter((e) => sameDay(e.date, d));
          return (
            <div key={d.toISOString()} className={cx('fk-month__cell', d.getMonth() !== view.m && 'fk-month__cell--out', sameDay(d, today) && 'fk-month__cell--today')}>
              <span className="fk-month__num">{d.getDate()}</span>
              {evs.slice(0, maxPerDay).map((e, i) => <button key={i} type="button" className={cx('fk-event', e.tone && 'fk-event--' + e.tone)} onClick={() => onEventClick && onEventClick(e)} title={e.title}>{e.time && <span className="fk-event__time">{e.time}</span>}{e.title}</button>)}
              {evs.length > maxPerDay && <button type="button" className="fk-month__more">+{evs.length - maxPerDay} más</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
