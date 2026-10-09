Vista mensual con eventos.

## Cuándo usarlo
- Vencimientos, despliegues, cierres de período, ausencias del equipo.

## Qué provee el consumidor
- `year`, `month` (0–11), `events` `{ date (Date), title, time, tone (accent · success · warning · info) }`, `today`, `maxPerDay`, `onEventClick`.

## Reglas
- Semana de lunes a domingo. Más de `maxPerDay` eventos se resumen en "+N más".
- `accent` (naranja) solo para hitos críticos: cierres y despliegues a PROD.
