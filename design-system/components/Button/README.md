Botón pill para acciones: primario, de marca, secundario, ghost, peligro e inverso.

## Cuándo usarlo
- `primary`: la acción principal de la vista. Una sola por pantalla o modal.
- `brand`: CTA de marca (relleno violeta noche + borde naranja 2px, como el sitio). Para login, portadas y vacíos de bienvenida.
- `secondary`: acciones alternativas (Exportar, Cancelar).
- `ghost`: acciones terciarias y dentro de tablas o cards.
- `danger`: acciones destructivas, siempre después de un `ConfirmDialog`.
- `inverse`: sobre `surface-brand` (header, barra de acciones masivas).

## Qué provee el consumidor
- `children` (verbo + objeto), `variant`, `size` (`sm` 32px · `md` 40px · `lg` 44px, el "Leer más" del sitio).
- `icon` / `iconRight` (nombres de `Icon`), `loading`, `disabled`, `block`, `href` (renderiza `<a>`).

## Reglas
- Texto en sentence case, sin punto final: "Guardar cambios".
- Con `loading` el ancho no cambia y el botón no recibe clics.
- No uses dos `primary` juntos; el segundo es `secondary`.
