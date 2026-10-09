Muestra dónde está la página dentro de la jerarquía y permite subir niveles.

## Cuándo usarlo
- En páginas de segundo nivel o más profundas, dentro de `PageHeader`.

## Qué provee el consumidor
- `items`: `{ label, href, onClick }`. El último es la página actual y no es link.

## Reglas
- Máximo 4 niveles; si hay más, empezá desde el módulo.
- No repitas el nombre de la app ni "Inicio" si el sidebar ya lo deja claro.
