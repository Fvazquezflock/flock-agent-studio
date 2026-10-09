Secciones de una misma entidad o página (Datos, Historial, Documentos).

## Cuándo usarlo
- Para dividir el detalle de un registro en secciones del mismo nivel.
- `variant="pill"` para filtros de vista livianos dentro de una card.

## Qué provee el consumidor
- `items`: `{ value, label, count, icon, disabled }`.
- `value` / `defaultValue` / `onChange`. El contenido lo renderizás vos (o con `TabPanel`).

## Reglas
- Entre 2 y 7 tabs. Si son más, replanteá la navegación.
- No uses tabs para pasos secuenciales: para eso está `Stepper`.
- Navegables con flechas ← →.
