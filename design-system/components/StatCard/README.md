KPI: una métrica con su variación y una sparkline.

## Cuándo usarlo
- Fila de 3–4 indicadores al inicio de un tablero o listado. Un número por card.

## Qué provee el consumidor
- `label`, `value` (ya formateado: "$ 48.250.000"), `delta` (% con signo), `deltaLabel`, `icon`, `spark` (array de números), `invert` (cuando bajar es bueno), `variant` (`default` | `brand`).

## Reglas
- La variación lleva ícono y signo, no solo color. Hasta 4 cards por fila (`Grid` de 3 columnas cada una).
- `brand` para el KPI principal, uno por pantalla como máximo.
