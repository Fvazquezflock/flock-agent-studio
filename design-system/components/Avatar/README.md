Persona o equipo, con foto o iniciales y estado de presencia. `AvatarGroup` superpone varios con "+N".

## Cuándo usarlo
- Responsables en tablas, autores de comentarios, menú de usuario, equipos asignados.

## Qué provee el consumidor
- `Avatar`: `name` (genera iniciales y color estable), `src`, `size` (`xs` 24 · `sm` 28 · `md` 32 · `lg` 40 · `xl` 56), `status` (`online` · `away` · `busy`), `tone` (forzar color).
- `AvatarGroup`: `people` (nombres u objetos `{ name, avatar }`), `max`, `size`.

## Reglas
- Siempre con `name` (es el texto accesible). El color de iniciales sale de la paleta de marca.
