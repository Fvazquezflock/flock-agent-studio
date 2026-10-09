Acción principal con un menú de alternativas relacionadas ("Exportar ▾").

## Cuándo usarlo
- Cuando hay una acción por defecto clara y variantes poco usadas (Exportar a Excel / CSV / PDF).

## Qué provee el consumidor
- `children` y `onClick` de la acción principal, `icon`, `items` (como en `DropdownMenu`), `variant` (`primary` | `secondary`), `size`, `disabled`.

## Reglas
- La acción principal debe ser la más frecuente; si no hay una, usá `DropdownMenu`.
