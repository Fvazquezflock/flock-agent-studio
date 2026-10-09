Plantilla de detalle: encabezado con estado y acciones, tabs, ficha, KPIs, historial y comentarios.

## Cuándo usarlo
- Punto de partida para la vista de un registro (un período, un partner, un contrato).

## Cómo se arma
- `PageHeader` con `onBack`, `StatusBadge`, acciones y `Tabs`.
- `Grid` 8 + 4: a la izquierda `StatCard`s, `Card` con `DescriptionList` y `Comments`; a la derecha `Card` con `Timeline`.
- Avisos contextuales con `Alert` arriba del contenido.

## Reglas
- La acción primaria cambia el estado del registro ("Aprobar período"); las demás, al menú ⋯.
