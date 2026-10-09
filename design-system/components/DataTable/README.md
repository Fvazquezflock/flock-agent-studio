La grilla de datos: orden y filtros por columna, selección de filas, acciones por fila, densidad, encabezado fijo y estados de carga y vacío.

## Cuándo usarlo
- Listados de registros con varias columnas comparables. Para 1–2 datos por ítem, `List`; para tarjetas visuales, `Card` en `Grid`.

## Qué provee el consumidor
- `columns`: `{ key, header, align ('right' para números), sortable, sortValue, render(row), sub (clave de texto secundario), width, minWidth, sticky }`.
- `rows`, `rowKey` (por defecto `id`).
- `selectable` + `selected` / `defaultSelected` / `onSelectionChange`.
- `sort` / `defaultSort` / `onSortChange` (sin `onSortChange` ordena en el cliente).
- Filtros de columna: `filter` en cada columna (`{ type: 'text' | 'select' | 'multi' | 'number' | 'date' }`), `filterMode` (`menu` en el encabezado · `row` fila de filtros), `filters` / `defaultFilters` / `onFiltersChange`, `manualFilters` (filtrado en el servidor). Ver `ColumnFilter`.
- `rowActions(row)` → items de `DropdownMenu`; `onRowClick`; `density` (`normal` 52px · `compact` 38px); `striped`.
- `loading`, `empty` (un `EmptyState`), `toolbar` (`TableToolbar`), `footer` (`Pagination`), `maxHeight`, `caption`.

## Reglas
- Números y montos alineados a la derecha con formato AR; estados con `StatusBadge`; códigos en `fk-mono`.
- Una sola columna con texto secundario. La primera columna identifica el registro.
- Acciones por fila en el menú ⋯ (máximo una acción visible).
