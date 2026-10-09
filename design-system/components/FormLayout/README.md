Estructura de formularios largos: secciones con título a la izquierda, campos en grilla y barra de acciones.

## Cuándo usarlo
- Altas y ediciones con más de 6 campos. Para 1–5 campos, un `Modal` o `Drawer` alcanza.

## Qué provee el consumidor
- `FormLayout`: `onSubmit`, `children` (secciones).
- `FormSection`: `title`, `description`, `columns` (1–3), `stacked` (título arriba), `children` (`FormField`). Usá `className="fk-span-2"` o `fk-span-all` para campos anchos.
- `FormActions`: `children` (botones), `note`, `sticky` (fija al pie al hacer scroll).

## Reglas
- Botones a la derecha: secundario (Cancelar) y primario (Guardar).
- Agrupá por tema, no por tipo de control.
