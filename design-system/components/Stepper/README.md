Progreso dentro de un flujo de varios pasos (altas, importaciones, wizards).

## Cuándo usarlo
- Flujos de 3 a 6 pasos que se completan en orden. Horizontal arriba del formulario; vertical en drawers o columnas angostas.

## Qué provee el consumidor
- `steps`: `{ label, description, status }` (`status` opcional: `done`, `current`, `upcoming`, `error`).
- `current`: índice del paso actual. `onStepClick` si se puede volver a pasos anteriores.
- `vertical`.

## Reglas
- Etiquetas cortas, con sustantivo: "Datos del partner", "Tarifas", "Revisión".
- El botón del pie dice el siguiente paso: "Continuar a tarifas".
