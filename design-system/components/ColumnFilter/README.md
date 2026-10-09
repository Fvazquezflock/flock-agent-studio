Filtros de la tabla (data-table filters): cada columna filtra sus propios valores, desde un ícono en el encabezado o desde una fila de filtros debajo de los títulos.

## Cuándo usarlo
- `filterMode="menu"` (por defecto): tablas de gestión donde se filtra de vez en cuando; el encabezado queda limpio y el ícono se marca cuando la columna tiene filtro.
- `filterMode="row"`: tablas de consulta intensiva (conciliaciones, auditorías) donde se filtra todo el tiempo, estilo planilla.
- Para filtros que cruzan varias columnas o no son columnas visibles, usá `FilterBar` o `FilterGrid` arriba de la tabla. Se pueden combinar.

## Qué provee el consumidor
- En cada columna de `DataTable`: `filter: { type, options, placeholder, value(row), searchable, currency, decimals }`.
  - `text`: condición (contiene, empieza con, es igual a, no contiene) + valor.
  - `select`: un valor; `multi`: varios con "Seleccionar todo" y cantidades. Sin `options`, se arman solas con los valores de la columna.
  - `number`: rango desde / hasta (formato AR); `date`: rango de fechas con calendario (acepta `Date` o "dd/mm/aaaa").
- En `DataTable`: `filterMode`, `filters` / `defaultFilters` / `onFiltersChange`, `manualFilters` (no filtra en el cliente: usalo cuando filtra el servidor), `showFilterSummary`.
- `ColumnFilter` también se puede usar suelto: `column`, `value`, `onChange`, `rows`, `variant` (`icon` | `field`).

## Reglas
- Los filtros activos se resumen arriba de la tabla como `FilterChip`, con "Limpiar filtros" y "Mostrando X de Y".
- Sin resultados, la tabla lo dice y ofrece limpiar los filtros; nunca una tabla vacía muda.
- Los paneles se aplican con "Aplicar"; en la fila de filtros, texto y selección filtran al instante.
- Filtrá sobre el valor real, no el formateado: usá `filter.value(row)` cuando la celda muestra otra cosa.
