Grilla de 12 columnas (`Grid` + `Col`) y pila (`Stack`) para maquetar páginas con los espaciados del sistema.

## Cuándo usarlo
- Para distribuir cards, KPIs y formularios en columnas. `Stack` para apilar con un gap de token.

## Qué provee el consumidor
- `Grid`: `cols` (por defecto 12), `gap` (nombre de token: `space-10`, `space-20`… o px), `responsive` (a 1 columna bajo 720px).
- `Col`: `span` (1–12).
- `Stack`: `direction` (`column` | `row`), `gap`, `align`, `justify`.

## Reglas
- Gutter por defecto `space-20`. Entre secciones de página, `space-40`.
- Layouts habituales: 8 + 4 (detalle + panel lateral), 3 × 4 (KPIs), 6 + 6 (formularios).
