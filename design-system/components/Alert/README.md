Mensaje en la página: información, éxito, advertencia o error. `banner` para avisos globales de ancho completo.

## Cuándo usarlo
- Estado que la persona tiene que ver mientras trabaja (validaciones de un formulario, un período con diferencias, mantenimiento programado).
- Para confirmar una acción que ya pasó, `Toast`.

## Qué provee el consumidor
- `tone` (`info` · `success` · `warning` · `danger` · `brand`), `title`, `children` (texto), `actions` (links o botones chicos), `onClose`, `banner`, `outline`, `icon`.

## Reglas
- Título que resume, texto que explica qué hacer. El tono siempre va con ícono.
- Fondo `-subtle` del estado y texto `ink`: sin bordes laterales de color.
