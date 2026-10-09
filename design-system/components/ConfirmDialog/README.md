Confirmación explícita antes de una acción destructiva o irreversible.

## Cuándo usarlo
- Eliminar, anular, dar de baja, enviar a muchos destinatarios. `confirmText` para lo irreversible y masivo.

## Qué provee el consumidor
- `open`, `onClose`, `onConfirm`, `tone` (`danger` · `warning` · `info`), `title` (pregunta concreta), `message` (consecuencias), `confirmLabel` (verbo exacto), `cancelLabel`, `confirmText` (texto a tipear), `loading`.

## Reglas
- El título nombra el objeto: "¿Eliminar el período de octubre?". El botón repite el verbo: "Eliminar período", nunca "Aceptar".
- Decí qué se pierde y si se puede deshacer.
