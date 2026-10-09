Barra de filtros rápidos sobre una lista: buscador, pills de filtro, chips activos y "Limpiar filtros".

## Cuándo usarlo
- Arriba de toda `DataTable` o `List` filtrable, con 1 a 5 dimensiones frecuentes. Para muchos criterios sumá `FilterPanel` (botón "Más filtros") o usá `FilterGrid`.

## Qué provee el consumidor
- `filters`: array de props de `FilterDropdown` con `key` (`{ key, label, options, multiple, searchable }`).
- `value` / `defaultValue` / `onChange` — objeto `{ [key]: valores[] }`.
- `search`, `searchPlaceholder`, `searchValue`, `onSearchChange`.
- `onMoreFilters` y `moreCount` para abrir el panel avanzado; `actions` a la derecha (Exportar, vistas).

## Reglas
- Los filtros activos se muestran siempre como `FilterChip`, con "Limpiar filtros" al final.
- Filtrar no cambia de página: resetea la paginación a 1.
