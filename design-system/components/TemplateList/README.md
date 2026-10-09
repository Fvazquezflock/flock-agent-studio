Plantilla de listado: shell, encabezado, vistas guardadas, grilla de filtros, tabla con acciones y paginación.

## Cuándo usarlo
- Punto de partida para cualquier pantalla de consulta de registros (partners, períodos, contratos).

## Cómo se arma
- `AppShell` con `Header`, `Sidebar` y `AppFooter`.
- `PageHeader` (título + Exportar + acción primaria) → `SavedViews` → `FilterGrid` → `DataTable` con `TableToolbar`, `StatusBadge` y `Pagination`.

## Reglas
- Un solo buscador por nivel: el del header es global; el de la tabla, local.
- Si la consulta es instantánea y con pocos criterios, reemplazá `FilterGrid` por `FilterBar`.
