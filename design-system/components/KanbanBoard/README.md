Tablero de columnas por estado; las tarjetas se arrastran entre columnas.

## Cuándo usarlo
- Seguimiento de tareas, hallazgos o tickets por estado. Para listados largos, `DataTable` con filtro de estado.

## Qué provee el consumidor
- `columns` `{ id, title, color (var de token), cards: [{ id, code, title, tags, assignee, due, comments }] }`, `onMove(cardId, columnId)`.

## Reglas
- 3 a 6 columnas. El punto de color de la columna se acompaña del nombre del estado.
