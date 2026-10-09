Menú de la persona usuaria: perfil, preferencias, tema y cerrar sesión.

## Cuándo usarlo
- En el `Header` (ya incluido) o al pie del `Sidebar`.

## Qué provee el consumidor
- `user` `{ name, role, email, avatar }`.
- `items` para reemplazar las opciones por defecto; `theme` + `onThemeChange` para el cambio claro/oscuro; `onSignOut`.
- `compact`: solo avatar (como en el header).

## Reglas
- "Cerrar sesión" siempre último, separado.
- No pongas acciones de negocio acá.
