Menú desplegable de acciones: el "⋯" de filas, cards y encabezados.

## Cuándo usarlo
- Para agrupar acciones secundarias o poco frecuentes. Para elegir un valor de formulario usá `Select`.

## Qué provee el consumidor
- `trigger`: cualquier `Button` o `IconButton`.
- `items`: `{ label, icon, onSelect, danger, disabled, shortcut, checked }`, `{ type: 'separator' }` o `{ type: 'label', label }`.
- `placement` (`start` | `end`), `open` / `defaultOpen` / `onOpenChange`, `closeOnSelect`.

## Reglas
- Acciones destructivas al final, separadas y en `danger`.
- Máximo ~8 ítems; si son más, agrupá con `label`.
- Se cierra con Esc o clic afuera.
