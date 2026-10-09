Hilo de comentarios sobre un registro, con menciones, respuestas y compositor.

## Cuándo usarlo
- Pestaña o panel de discusión en detalles (períodos, contratos, tickets).

## Qué provee el consumidor
- `comments` `{ author, time, text (las @menciones se resaltan), reply }`, `currentUser` `{ name }` (muestra el compositor), `onSubmit(text)`, `placeholder`.

## Reglas
- Orden cronológico, el más viejo arriba. Respuestas indentadas un nivel.
