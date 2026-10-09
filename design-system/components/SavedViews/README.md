Vistas guardadas: combinaciones de filtros con nombre, a un clic.

## Cuándo usarlo
- Listados que la gente consulta siempre con los mismos filtros ("Pendientes de aprobar", "Mis partners"). Va entre el `PageHeader` y la `FilterBar`.

## Qué provee el consumidor
- `views` `{ id, label, count, default }`, `value` / `defaultValue` / `onChange`, `onSave` (botón "Guardar vista"), `onAction(acción, vistaId)` para renombrar, duplicar, marcar como predeterminada o eliminar.

## Reglas
- Hasta 6 vistas visibles. La predeterminada lleva estrella `accent`.
