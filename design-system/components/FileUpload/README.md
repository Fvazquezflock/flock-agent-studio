Zona para arrastrar o elegir archivos, con la lista de adjuntos y su estado.

## Cuándo usarlo
- Adjuntar Excel de horas, facturas en PDF, documentación de partners.

## Qué provee el consumidor
- `files` / `defaultFiles` (`{ name, size, progress, error }`), `onFiles(FileList)`, `onRemove(file)`, `accept`, `multiple`, `hint` (formatos y tamaño máximo).

## Reglas
- Decí qué formatos y tamaño se aceptan. Un error se explica en la fila del archivo, con acción de reintentar.
