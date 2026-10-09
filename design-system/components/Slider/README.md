Valor o rango numérico sobre una pista.

## Cuándo usarlo
- Rangos aproximados en filtros (porcentaje de avance, rango de tarifas). Para valores exactos usá `NumberInput`.

## Qué provee el consumidor
- `label`, `min`, `max`, `step`, `value` / `defaultValue` (número, o `[desde, hasta]` para rango), `onChange`, `format(n)`, `showScale`.

## Reglas
- Mostrá siempre el valor elegido con formato (%, $).
