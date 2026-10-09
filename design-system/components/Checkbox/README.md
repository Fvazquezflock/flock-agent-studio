Casilla de verificación: una opción independiente, o varias con `CheckboxGroup`.

## Cuándo usarlo
- Opciones que se confirman al guardar y selección de filas. Para activar algo al instante usá `Switch`.

## Qué provee el consumidor
- `Checkbox`: `label`, `description`, `checked` / `defaultChecked` / `onChange(checked)`, `indeterminate`, `disabled`.
- `CheckboxGroup`: `legend`, `options`, `value` / `defaultValue` (array) / `onChange`, `row`.

## Reglas
- El label describe el estado activo en positivo: "Enviar copia al partner".
