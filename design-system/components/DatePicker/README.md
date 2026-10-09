Fecha o rango de fechas en formato dd/mm/aaaa, con calendario y atajos.

## Cuándo usarlo
- Fechas de alta, vencimientos y períodos. `range` para filtros por período.

## Qué provee el consumidor
- `value` / `defaultValue` / `onChange` — un `Date`, o `{ from, to }` con `range`.
- `range`, `presets` (Últimos 7 días, Este mes, Mes anterior), `minDate`, `maxDate`, `placeholder`, `size`, `invalid`, `disabled`.

## Reglas
- Semana de lunes a domingo; meses en español. El día de hoy lleva un anillo `primary`.
