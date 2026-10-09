Encabezado de página: breadcrumbs, título, estado, descripción, acciones y, opcionalmente, tabs.

## Cuándo usarlo
- Al inicio de cada página dentro de `AppShell`. Uno por página.

## Qué provee el consumidor
- `title` (en `heading-1`), `description`, `breadcrumbs` (array de `{ label, href }`).
- `status`: un `StatusBadge` junto al título (páginas de detalle).
- `actions`: botones; como máximo un `primary` y dos secundarios. El resto va en un `DropdownMenu` (⋯).
- `onBack`: muestra flecha de volver en páginas de detalle.
- `tabs`: un `Tabs` debajo del título.

## Reglas
- El título repite el nombre del ítem del sidebar o el nombre del registro ("Contrato CTR-2026-014").
- La acción primaria va a la derecha de todo.
