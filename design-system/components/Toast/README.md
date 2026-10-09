Confirmación breve de una acción, que desaparece sola. Se apilan con `ToastStack` abajo a la derecha.

## Cuándo usarlo
- Después de guardar, enviar, copiar o exportar. Si la persona tiene que actuar, usá `Alert` o un `Modal`.

## Qué provee el consumidor
- `Toast`: `tone` (`success` · `info` · `warning` · `danger`), `title`, `children`, `action` (por ejemplo "Deshacer"), `onClose`.
- `ToastStack`: contenedor fijo; `inline` para mostrarlo en el flujo.

## Reglas
- Máximo 3 a la vez; duran 5 s (los de error quedan hasta cerrarlos).
- Texto en pasado: "Período guardado".
