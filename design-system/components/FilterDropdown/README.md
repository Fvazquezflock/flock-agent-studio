Pill de filtro que abre una lista con checkboxes (o una sola opción) para filtrar por una dimensión.

## Cuándo usarlo
- Dentro de `FilterBar`, o suelto sobre una tabla. Cada pill es una dimensión: Estado, Partner, Equipo.

## Qué provee el consumidor
- `label`, `options` (strings o `{ value, label, count }`), `value` / `defaultValue` (array) / `onChange`.
- `multiple` (por defecto `true`; `false` usa radios), `searchable` (automático con más de 7 opciones), `placement`.

## Reglas
- Se aplica con "Aplicar"; "Limpiar" quita el filtro. La pill activa muestra el primer valor y "+N".
- Mostrá cantidades (`count`) cuando ayuden a decidir.
