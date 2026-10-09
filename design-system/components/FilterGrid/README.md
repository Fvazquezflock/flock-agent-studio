Formulario de filtros en grilla sobre un listado, con "Buscar" y "Limpiar" — el clásico panel de búsqueda de los sistemas de gestión.

## Cuándo usarlo
- Búsquedas con muchos criterios donde la persona arma la consulta y luego busca (por ejemplo, consultas sobre bases grandes). Para filtros instantáneos y pocos criterios, `FilterBar`.

## Qué provee el consumidor
- `children`: `FormField` con sus controles (los visibles siempre).
- `more`: campos adicionales que se muestran con "Más filtros".
- `columns` (por defecto 4; 2 bajo 900px), `onSearch`, `onClear`, `activeCount`, `title`, `variant` (`default` | `subtle`), `searchLabel`.

## Reglas
- Primera fila con los 4 criterios más usados. Enter en cualquier campo dispara la búsqueda.
- Debajo va la `DataTable` con los resultados y su total.
