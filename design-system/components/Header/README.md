Barra superior de marca: logo, nombre del producto, ambiente, buscador global, notificaciones y usuario.

## Cuándo usarlo
- En el slot `header` de `AppShell`. Siempre sobre `surface-brand` (violeta noche), en ambos temas.

## Qué provee el consumidor
- `logoSrc`: el isologo blanco (`assets/Logos/flock-logo.png`); sin él se muestra la palabra "flock".
- `product`: nombre corto del sistema ("Facturación", "Portal de Gestión").
- `env`: `dev` · `test` · `uat` · `prod` — se muestra con `EnvBadge`. Omitilo solo en PROD si el producto lo decide.
- `search`, `searchPlaceholder`, `onSearchFocus` (abrí `CommandPalette` desde acá).
- `notifications` (número), `user` `{ name, role, email }`, `userMenuItems`, `actions`, `onMenuClick`.

## Reglas
- Alto fijo 64px. Un solo buscador por pantalla: si el header tiene búsqueda global, la tabla usa su propia búsqueda local.
- No cambies el fondo: es la firma de marca de la app.
