Navegación entre páginas de resultados, con cantidad por página y total.

## Cuándo usarlo
- Debajo de toda `DataTable` o `List` con más de 20 registros (en el slot `footer` de la tabla).

## Qué provee el consumidor
- `total`, `page` / `defaultPage` / `onPageChange`, `pageSize` / `defaultPageSize` / `onPageSizeChange`.
- `pageSizes` (por defecto 10, 20, 50, 100), `noun` ("registros", "partners"), `compact`.

## Reglas
- Números con formato AR (1.248). Página actual en `primary`.
- Al cambiar filtros, volvé a la página 1.
