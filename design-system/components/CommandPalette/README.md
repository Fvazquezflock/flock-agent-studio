Búsqueda global y acciones rápidas con teclado (Ctrl+K).

## Cuándo usarlo
- Apps con muchas pantallas o registros. Se abre desde el buscador del `Header` o con Ctrl+K.

## Qué provee el consumidor
- `groups`: `{ label, items: [{ label, icon, hint, shortcut }] }` (por ejemplo "Ir a…", "Registros", "Acciones").
- `open`, `onClose`, `onSelect(item)`, `placeholder`.

## Reglas
- Resultados agrupados; máximo ~8 por grupo.
- Navegable con ↑ ↓ Enter Esc; mostralo en el pie.
