Elegir una opción de una lista cerrada y corta.

## Cuándo usarlo
- Hasta ~10 opciones conocidas. Con más opciones o si hay que buscar, usá `Combobox`. Con 2–4 opciones visibles, `RadioGroup`.

## Qué provee el consumidor
- `options`: strings o `{ value, label, description, icon, disabled, group }`.
- `value` / `defaultValue` / `onChange(value)`, `placeholder`, `size`, `invalid`, `disabled`.

## Reglas
- Placeholder con verbo: "Elegí un estado". Navegable con ↑ ↓ Enter Esc.
