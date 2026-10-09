Diálogo enfocado para formularios cortos y decisiones que bloquean el flujo.

## Cuándo usarlo
- Tareas de 1–5 campos que no justifican una página (renombrar, agregar un contacto). Para editar con contexto de la lista, `Drawer`; para confirmar algo destructivo, `ConfirmDialog`.

## Qué provee el consumidor
- `open`, `onClose`, `title`, `description`, `children`, `footer` (botones), `footerStart` (contenido a la izquierda del pie), `size` (`sm` 420 · `md` 560 · `lg` 800), `closeOnBackdrop`.

## Reglas
- Título con verbo: "Agregar contacto". Botón primario a la derecha con la misma acción.
- Se cierra con Esc, con la X y con clic afuera (salvo cambios sin guardar).
- Un solo modal a la vez.
