Campo de texto de una línea, con ícono, prefijo/sufijo, contador y botón de limpiar.

## Cuándo usarlo
- Datos cortos: nombres, códigos, emails, CUIT. Para importes usá `NumberInput`; para búsquedas, `SearchField`.

## Qué provee el consumidor
- `value` / `defaultValue` / `onChange(value, event)`, `placeholder`, `type`.
- `icon`, `prefix`, `suffix`, `clearable`, `maxLength` + `showCount`.
- `size` (`sm` 32px · `md` 40px · `lg` 48px), `invalid`, `disabled`, `readOnly`.

## Reglas
- Siempre dentro de un `FormField`. El placeholder es un ejemplo, nunca el label.
