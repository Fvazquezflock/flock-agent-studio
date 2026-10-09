Jerarquía expandible: organización, módulos, carpetas.

## Cuándo usarlo
- Datos con más de dos niveles de anidamiento. Para dos niveles alcanza el `Sidebar` o un `Accordion`.

## Qué provee el consumidor
- `data` `{ id, label, icon, meta, children }`, `defaultExpanded` (ids), `selected` / `defaultSelected`, `onSelect(id, node)`.

## Reglas
- Íconos de carpeta para nodos con hijos; metadato (cantidad) a la derecha.
