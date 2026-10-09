Gráficos de barras, líneas y dona con la paleta de marca, leyenda y tooltip al pasar el mouse.

## Cuándo usarlo
- `bar`: comparar magnitudes entre categorías (horas por partner). `line`: evolución en el tiempo. `donut`: partes de un total con 2–5 categorías.
- Si el mensaje es un solo número, usá `StatCard`.

## Qué provee el consumidor
- `type`, `title`, `subtitle`, `categories` (eje X o porciones), `series` `{ name, data[] }`, `format(n)` para valores y ejes, `height`, `centerLabel` (dona), `showTable` (tabla accesible debajo).

## Reglas
- Colores en orden fijo `chart-1` → `chart-4`; a partir de la quinta serie, agrupá en "Otros" (`chart-other`). El color sigue a la entidad, no al ranking.
- Un solo eje Y. Nunca dos escalas en el mismo gráfico.
- Con 2 o más series siempre hay leyenda. Textos en tokens de texto, nunca del color de la serie.
