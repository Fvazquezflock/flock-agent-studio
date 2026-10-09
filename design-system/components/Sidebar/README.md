Navegación lateral colapsable con secciones, contadores e ítems anidados.

## Cuándo usarlo
- En el slot `sidebar` de `AppShell`, para la navegación principal de la app (hasta ~12 ítems de primer nivel).

## Qué provee el consumidor
- `items`: `{ label, icon, href, active, count, children, onClick }` o `{ type: 'section', label }`.
- `footerItems`: ítems fijos abajo (Configuración, Ayuda).
- `collapsed` / `defaultCollapsed` / `onCollapsedChange`; `collapsible`.
- `variant`: `default` (sobre `surface`) o `brand` (sobre `surface-brand`).

## Reglas
- Un solo ítem `active`. El activo usa `primary-subtle` con ícono en `primary-text`.
- Todo ítem lleva ícono: colapsado solo se ven los íconos (con tooltip nativo).
- Máximo dos niveles. Para más profundidad usá `Tabs` dentro de la página.
- Secciones en sentence case ("Gestión", no "GESTIÓN").
