Barra de acciones sobre las filas seleccionadas de una tabla.

## Cuándo usarlo
- Cuando una `DataTable` tiene `selectable` y hay acciones masivas (aprobar, exportar, eliminar). Aparece solo si hay selección.

## Qué provee el consumidor
- `count`, `noun` (singular y plural), `actions` `{ label, icon, onClick }`, `onClear`, `floating` (fija abajo al centro).

## Reglas
- Máximo 4 acciones. Las destructivas piden confirmación con el número de elementos: "Eliminar 8 registros".
