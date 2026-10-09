Progreso de un proceso largo: importaciones, generación de archivos, cargas masivas. Incluye `ProgressRing` para espacios chicos.

## Cuándo usarlo
- Procesos de más de ~3 s con avance medible. Si no se puede medir, `indeterminate`.

## Qué provee el consumidor
- `ProgressBar`: `value` (0–100), `label`, `hint`, `tone` (`primary` · `success` · `warning` · `danger`), `size` (`sm` | `md`), `indeterminate`, `showValue`.
- `ProgressRing`: `value`, `size`, `stroke`, `label`.

## Reglas
- Decí qué está pasando y cuánto falta: "Importando 1.248 de 4.028 filas".
