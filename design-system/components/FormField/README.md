Contenedor de un campo: label, marca de obligatorio u opcional, ayuda y error.

## Cuándo usarlo
- Alrededor de todo control de formulario (`TextInput`, `Select`, `DatePicker`…). Le pasa `id`, `invalid` y `aria-describedby` al control.

## Qué provee el consumidor
- `label`, `required` u `optional`, `hint`, `error` (reemplaza al hint y pone el control en rojo), `inline`, `children` (un control).

## Reglas
- Label corto, sin dos puntos: "Razón social".
- Marcá lo que sea minoría: si casi todo es obligatorio, marcá los opcionales.
- El error dice cómo corregir: "Ingresá un CUIT de 11 dígitos".
