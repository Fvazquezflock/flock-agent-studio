Campana con contador de no leídas y panel de notificaciones.

## Cuándo usarlo
- En el `Header`, para avisos que requieren seguimiento (aprobaciones, menciones, procesos terminados).

## Qué provee el consumidor
- `items` `{ actor | icon, text (puede incluir <b>), time, unread }`, `onMarkAllRead`, `inverse` (sobre el header), `defaultOpen`.

## Reglas
- Texto con sujeto y acción: "Martín López aprobó el período de octubre". Tiempo relativo ("hace 5 min").
- Lo urgente también va por mail; la campana no reemplaza al `Alert`.
