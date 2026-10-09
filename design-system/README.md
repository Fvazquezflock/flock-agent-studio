Sistema de diseño para los productos internos de Flock IT (back-offices, herramientas de gestión, tableros). Toma la identidad pública de flockit.com.ar —violeta noche, violeta de marca, naranja de acento, Tomato Grotesk liviana y formas pill— y la lleva a interfaces densas de trabajo diario. Todo lo marcado como *propuesta* en los tokens no existe en el sitio y está abierto a revisión.

## Principios

- **Marca en los bordes, claridad en el centro.** El violeta y el naranja identifican (header, foco, acción principal); el contenido de trabajo vive sobre `surface` neutra.
- **Denso pero respirado.** Texto por defecto en `body` (14/20); espaciado en el ritmo de 10px del sitio (`space-10`, `space-20`, `space-30`).
- **Pill = acción.** Todo lo que se aprieta o se filtra es pill (`radius-pill`); lo que contiene es `radius-lg`; lo que se completa es `radius-md`.
- **El estado nunca depende solo del color.** Siempre ícono + palabra.

## Voz y contenido

- Español rioplatense con voseo, como el sitio: "Contanos tu desafío", "Conocenos". En la app: "Revisá los datos", "Elegí un período". Mantener el voseo también en imperativos con tilde ("Agendá", "Exportá"); el sitio a veces lo pierde ("Agenda una consultoría estratégica").
- Mayúscula solo al inicio (sentence case) en títulos, botones y menús: "Exportar a Excel", no "Exportar A Excel". Siglas en mayúsculas: TEST, CUIT, PDF.
- Botones con verbo + objeto: "Guardar cambios", "Generar mails", "Descartar borrador". Nunca "OK" ni "Aceptar" solos en acciones destructivas: "Eliminar partner".
- Tono directo y breve; sin signos de exclamación en la UI, sin emojis.
- Formato argentino: `1.234,56`, `$ 1.234,56`, fechas `dd/mm/aaaa`, hora 24 h `14:32`. IDs y códigos en `code`.
- Mensajes de error: qué pasó + cómo seguir. "No pudimos guardar el contrato. Revisá tu conexión y probá de nuevo."

## Color

- Fondo de página `bg`; contenedores `surface`; encabezados de tabla y zonas de filtro `surface-subtle`; menús y modales `surface-raised` con `shadow-overlay`.
- Texto `ink`; secundario `ink-muted`; placeholder y metadatos `ink-subtle`. Nunca texto de color de marca sobre claro salvo `primary-text`.
- Acción principal: relleno `primary` + texto `on-primary`; hover `primary-hover`. Una sola acción primaria por vista.
- `accent` (naranja) es borde y señal, no texto: borde 2px de botones de marca, indicador de novedad, anillo de foco (`focus`). Si un relleno es naranja, el texto es `on-accent`.
- Selección (fila, ítem de nav, chip activo): `primary-subtle` con texto `ink` o `primary-text`.
- Estados: `success`, `warning`, `danger`, `info` para texto/ícono/borde; sus `-subtle` para fondos de alertas y badges. `danger` es carmín, deliberadamente más oscuro que el naranja de marca.
- `brand-magenta` queda para ilustración y gráficos; no es un estado.
- **Tema claro** es el de trabajo diario (propuesta). **Tema oscuro** replica el sitio: `bg` = `brand-night`, `surface` = #331A42 (blanco 10%), bordes = blanco 20%.

### Degradés de marca

El sitio usa tres degradés; solo en superficies de marca (login, portadas, encabezados de reportes), nunca en UI densa ni detrás de texto chico:

| Degradé | Paradas |
| --- | --- |
| Horizonte | `brand-violet` → `brand-orange` (izq. a der.) |
| Brasa | #F04D18 → #8C00B8 (izq. a der.) |
| Noche | `brand-purple` 0% → `brand-night` 100% (90°) |

Brillos radiales del sitio: `brand-purple-deep` → transparente al 59%; `brand-orange` → transparente al 69%. Usar uno por pantalla como máximo.

## Tipografía

- Familia `sans`: **Tomato Grotesk** (Light 300, Regular 400, Bold 700), la del sitio. Mientras no estén cargados los archivos con licencia, se ve **Public Sans** como respaldo.
- La marca escribe liviano: títulos en 300 (`heading-1`, `heading-2`, `display-*`) con tracking 0.9–1.12px. No usar Bold en títulos grandes.
- UI: `body` por defecto; `body-sm` para labels de campo (en `ink-muted`), ayudas y metadatos; `caption` (12px) es el mínimo.
- Títulos de página `heading-1`; secciones, modales y drawers `heading-2`; cards `heading-3`.
- Botones grandes `button` (16px, el CTA del sitio); medianos y chicos `button-sm`.
- Números en tablas alineados a la derecha; IDs y códigos en `code`.

## Espaciado y layout

- Escala en el ritmo de 10px del sitio: `space-5`, `space-10`, `space-15`, `space-20`, `space-30`, `space-40`, `space-60`.
- Padding de card `space-20` (compacta) o `space-30` `space-40` (como el sitio). Gap entre campos `space-15`; entre secciones `space-40`.
- App shell: sidebar 248px (68px colapsada), header 64px, contenido con margen `space-30`. Grilla de 12 columnas con gutter `space-20`.

## Formas, bordes y elevación

- `radius-pill`: botones, chips, tags, filtros, switches, búsqueda.
- `radius-md`: inputs, selects, dropdowns, menús, alertas.
- `radius-lg`: cards, modales, drawers, paneles.
- `radius-sm`: checkbox, badges dentro de tablas, tooltips.
- Bordes `border-1` en `border` para dividir; controles con `border-strong`. Botón de marca: `border-2` en `accent`.
- Elevación mínima: `shadow-sm` solo para cards en claro; `shadow-overlay` para todo lo que flota.

## Estados de interacción

- Hover: un paso más profundo (`primary-hover`) o fondo `surface-subtle` en elementos neutros.
- Foco: anillo `border-2` en `focus` con 2px de separación, siempre visible con teclado.
- Seleccionado: `primary-subtle`. Deshabilitado: opacidad 0.4 y sin cursor; nunca ocultar acciones por permisos sin explicar.
- Movimiento: 150–200 ms, ease-out, solo en aperturas (menús, drawers) y feedback; respetar `prefers-reduced-motion`.

## Iconografía

- Set de línea **Lucide** (licencia ISC) incluido en el bundle como `Icon`: trazo 1.75px, puntas redondeadas, 16px en controles chicos y 18–20px por defecto. El sitio usa PNGs sueltos; este set es una incorporación para la app.
- Color heredado: `ink-muted` por defecto, `primary-text` cuando está activo, color de estado solo junto a una palabra.
- Sin emojis como íconos. Un ícono solo, sin texto, siempre lleva `label` o va dentro de un `IconButton` con tooltip.

## Logo

- `assets/Logos/flock-logo.png`: isologo blanco (222×57). Solo sobre `brand-night`, `surface-brand`, `brand-purple` o fotos oscuras.
- Altura mínima 24px en el header de la app; aire alrededor igual a la altura de la "f".
- No recolorear, no estirar, no poner sobre `bg` claro: falta la versión oscura del logo.

## Gráficos

- Series en orden fijo: `chart-1` (violeta), `chart-2` (naranja), `chart-3` (índigo), `chart-4` (magenta); de la quinta en adelante, agrupar en "Otros" con `chart-other`. Paleta validada para daltonismo y contraste en ambos temas.
- Un solo eje Y; grilla en `border`, ejes y etiquetas en `ink-subtle`; valores siempre con formato AR. Con dos o más series, leyenda siempre.

## Componentes

- Todo está construido con clases `fk-*` sobre los tokens (`components/bundle.css`), así que sirve para cualquier stack. En React 18, `window.FlockUI` expone los componentes y un helper `html` para escribir pantallas sin build.
- Pantalla tipo: `AppShell` → `PageHeader` → `SavedViews` → `FilterBar` o `FilterGrid` → `DataTable` con `TableToolbar` y `Pagination`. Detalle: `PageHeader` con `Tabs` → `Grid` 8 + 4 con `Card`, `DescriptionList`, `Timeline` y `Comments`. Ver las plantillas `TemplateList` y `TemplateDetail`.
- Ventanas: `Modal` para 1–5 campos, `Drawer` para ver o editar sin perder la lista, `ConfirmDialog` para lo destructivo.

## Accesibilidad

- Todo par de texto declarado en los tokens cumple 4.5:1 en ambos temas; bordes de control y foco ≥3:1.
- Áreas táctiles de 40px mínimo (botón mediano); 32px solo en tablas compactas.
- Toda acción con ícono solo lleva `aria-label` y tooltip.
