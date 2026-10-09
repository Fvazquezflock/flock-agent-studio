Acción compacta solo con ícono, para toolbars, tablas y headers.

## Cuándo usarlo
- Acciones obvias por su ícono (editar, cerrar, más opciones). Si el ícono no es obvio, usá `Button` con texto.

## Qué provee el consumidor
- `icon`, `label` (obligatorio: se usa como `aria-label` y tooltip), `variant` (`ghost` · `secondary` · `primary` · `danger` · `inverse`), `size`.
- `badge`: número o `true` (punto) para notificaciones; `pressed` para toggles.

## Reglas
- Área mínima 32px (tablas) o 40px (resto).
- No pongas más de 3 icon buttons seguidos; agrupá el resto en un `DropdownMenu`.
