Estructura base de toda app interna: header de marca arriba, sidebar a la izquierda, contenido y footer.

## Cuándo usarlo
- Siempre, como raíz de cada aplicación interna. Una sola por app.

## Qué provee el consumidor
- `header`: normalmente un `Header`.
- `sidebar`: normalmente un `Sidebar`.
- `footer` (opcional): `AppFooter`.
- `children`: el contenido de la página, que arranca con un `PageHeader`.
- `fixed`: alto fijo con scroll interno (para embeber en un contenedor de altura conocida).

## Reglas
- El contenido tiene margen `space-30`; no agregues otro contenedor con padding.
- El header queda fijo al hacer scroll; el sidebar ocupa todo el alto.
- No anides dos `AppShell`.
