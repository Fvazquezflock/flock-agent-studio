Contenedor con encabezado, acciones y pie opcionales.

## Cuándo usarlo
- Agrupar información relacionada en una página: fichas, gráficos, formularios cortos.
- `interactive` para tarjetas que navegan; `brand` para destacar un bloque (uno por pantalla); `subtle` dentro de otras superficies.

## Qué provee el consumidor
- `title` (en `heading-3`), `subtitle`, `actions` (icon buttons o un `DropdownMenu`), `footer`, `children`.
- `variant` (`default` · `brand` · `subtle`), `padding` (`default` 20px · `roomy` 30/40px como el sitio · `none`), `interactive`, `selected`, `onClick`.

## Reglas
- Radio `radius-lg`, borde `border`, `shadow-sm` solo en claro.
- No anides cards con borde; dentro de una card usá `subtle` o `Divider`.
- Sin barras de color al costado.
