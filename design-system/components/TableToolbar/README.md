Barra superior de una tabla: título, total, búsqueda local, columnas visibles, densidad y acciones. Cambia a modo selección cuando hay filas marcadas.

## Cuándo usarlo
- En el slot `toolbar` de `DataTable`.

## Qué provee el consumidor
- `title`, `count`, `search`, `searchPlaceholder`, `onSearchChange`.
- `columns` `{ key, label, visible }` + `onColumnsChange` (menú "Columnas").
- `density` + `onDensityChange`, `actions` (Exportar, `SplitButton`).
- `selectedCount`, `bulkActions`, `onClearSelection` (modo selección).

## Reglas
- Total con formato AR ("1.248 registros"). En modo selección solo se muestran acciones masivas.
