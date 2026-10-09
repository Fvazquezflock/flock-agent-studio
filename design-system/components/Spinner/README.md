Indicador de carga indeterminada.

## Cuándo usarlo
- Esperas cortas (menos de ~3 s) en botones, celdas o paneles. Para contenido que se está cargando, preferí `Skeleton`; para procesos largos, `ProgressBar`.

## Qué provee el consumidor
- `size` (px), `label` (texto visible y accesible).

## Reglas
- No bloquees toda la pantalla con un spinner. En botones usá `Button loading`.
