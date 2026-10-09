# Catálogo de componentes

Inventario de componentes para los sistemas internos. Todos tienen su card con preview en vivo y guía de uso en la sección Componentes, con el nombre de la columna **En código**. Prioridad sugerida: **P1** = base para cualquier pantalla (MVP), **P2** = pantallas de gestión completas, **P3** = casos específicos. Estado: *propuesta en revisión*.

## A. Layout y navegación

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 1 | App shell | `AppShell` | Estructura base: sidebar + header + contenido | P1 |
| 2 | Header / Top bar | `Header` | Logo, buscador global, ambiente, notificaciones, usuario | P1 |
| 3 | Sidebar | `Sidebar` | Navegación lateral colapsable, secciones, contadores | P1 |
| 4 | Page header | `PageHeader` | Título de página + breadcrumbs + acciones | P1 |
| 5 | Breadcrumbs | `Breadcrumbs` | Ubicación dentro de la jerarquía | P1 |
| 6 | Tabs | `Tabs` | Secciones dentro de una entidad (Datos, Historial, Documentos) | P1 |
| 7 | Pagination | `Pagination` | Navegar resultados de tablas y listas | P1 |
| 8 | Stepper / Wizard | `Stepper` | Altas en varios pasos | P2 |
| 9 | Menú de usuario | `UserMenu` | Perfil, preferencias, tema, cerrar sesión | P2 |
| 10 | Command palette | `CommandPalette` | Búsqueda global y atajos (Ctrl+K) | P3 |
| 11 | Footer de app | `AppFooter` | Versión, ambiente, soporte | P3 |

## B. Acciones

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 12 | Button | `Button` | Primario, secundario, ghost, peligro; 3 tamaños; con ícono; cargando | P1 |
| 13 | Icon button | `IconButton` | Acciones compactas en tablas y toolbars | P1 |
| 14 | Link | `Link` | Navegación dentro de texto y celdas | P1 |
| 15 | Dropdown menu | `DropdownMenu` | Menú de acciones (⋯) por fila o por página | P1 |
| 16 | Split button | `SplitButton` | Acción principal + alternativas ("Exportar ▾") | P2 |
| 17 | Segmented control | `SegmentedControl` | Alternar vistas o períodos (Día / Semana / Mes) | P2 |
| 18 | Bulk action bar | `BulkActionBar` | Barra de acciones al seleccionar varias filas | P2 |

## C. Formularios

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 19 | Form field | `FormField` | Contenedor: label, requerido, ayuda, error | P1 |
| 20 | Text input | `TextInput` | Texto con prefijo/sufijo, limpiar, estados | P1 |
| 21 | Textarea | `Textarea` | Observaciones, comentarios | P1 |
| 22 | Select | `Select` | Lista cerrada de opciones | P1 |
| 23 | Combobox / Autocomplete | `Combobox` | Lista larga con búsqueda (clientes, partners) | P1 |
| 24 | Multiselect | `MultiSelect` | Varias opciones con chips | P1 |
| 25 | Checkbox | `Checkbox` | Opción individual y selección en tablas | P1 |
| 26 | Radio group | `RadioGroup` | Una opción entre pocas | P1 |
| 27 | Switch | `Switch` | Activar/desactivar al instante | P1 |
| 28 | Date picker / Range | `DatePicker` | Fechas y períodos (dd/mm/aaaa) | P1 |
| 29 | Number / Currency input | `NumberInput` | Importes con formato AR ($ 1.234,56), porcentajes | P1 |
| 30 | Search field | `SearchField` | Búsqueda pill en tablas y header | P1 |
| 31 | File upload / Dropzone | `FileUpload` | Adjuntar Excel, PDF, imágenes | P2 |
| 32 | Time picker | `TimePicker` | Horarios | P3 |
| 33 | Slider / Range | `Slider` | Rangos numéricos | P3 |
| 34 | Form layout / Fieldset | `FormLayout` | Grillas y grupos de campos, barra de guardar fija | P2 |

## D. Filtros, datos y visualización

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 35 | Filter bar | `FilterBar` | Fila de filtros rápidos + "Limpiar filtros" | P1 |
| 36 | Filter chip | `FilterChip` | Filtro activo removible, pill | P1 |
| 37 | Data table | `DataTable` | Orden, filtros por columna, selección, acciones por fila, columnas fijas, densidad | P1 |
| 38 | Table toolbar | `TableToolbar` | Búsqueda, columnas visibles, exportar, densidad | P1 |
| 39 | Panel de filtros avanzados | `FilterPanel` | Drawer con todos los criterios | P2 |
| 40 | Vistas guardadas | `SavedViews` | Combinaciones de filtros con nombre | P3 |
| 41 | Description list | `DescriptionList` | Detalle clave–valor de un registro | P1 |
| 42 | List / List item | `List` | Listas simples con avatar, meta y acción | P2 |
| 43 | KPI / Stat card | `StatCard` | Métrica + variación + sparkline | P2 |
| 44 | Charts | `Chart` | Barras, líneas, dona con la paleta de marca | P2 |
| 45 | Timeline / Historial | `Timeline` | Actividad y auditoría de un registro | P2 |
| 46 | Tree view | `TreeView` | Jerarquías (organización, módulos) | P3 |
| 47 | Kanban board | `KanbanBoard` | Estados de tareas o tickets | P3 |
| 48 | Calendar | `Calendar` | Vista mensual/semanal de eventos | P3 |

## E. Contenedores y superposiciones

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 49 | Card | `Card` | Básica, con header y acciones, clickeable | P1 |
| 50 | Modal / Dialog | `Modal` | Formularios cortos y confirmaciones | P1 |
| 51 | Confirm dialog | `ConfirmDialog` | Acciones destructivas con texto explícito | P1 |
| 52 | Drawer / Side panel | `Drawer` | Detalle o edición sin salir de la tabla | P1 |
| 53 | Tooltip | `Tooltip` | Ayuda breve y etiqueta de icon buttons | P1 |
| 54 | Popover | `Popover` | Contenido interactivo flotante | P2 |
| 55 | Accordion | `Accordion` | Secciones colapsables | P2 |
| 56 | Divider | `Divider` | Separación de bloques | P1 |

## F. Feedback y estado

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 57 | Alert / Banner | `Alert` | Info, éxito, advertencia, error; en página o global | P1 |
| 58 | Toast | `Toast` | Confirmación breve de una acción | P1 |
| 59 | Status badge | `StatusBadge` | Estado de un registro (Activo, Pendiente, Rechazado) | P1 |
| 60 | Tag / Chip | `Tag` | Categorías, tecnologías, etiquetas | P1 |
| 61 | Spinner | `Spinner` | Carga puntual | P1 |
| 62 | Skeleton | `Skeleton` | Carga de tablas y cards | P2 |
| 63 | Progress bar | `ProgressBar` | Procesos largos (importaciones, generación de archivos) | P2 |
| 64 | Empty state | `EmptyState` | Sin datos / sin resultados de filtro | P1 |
| 65 | Páginas de error | `ErrorPage` | 404, 500, sin permisos, mantenimiento | P2 |
| 66 | Environment badge | `EnvBadge` | DEV / TEST / PROD siempre visible | P1 |

## G. Personas y colaboración

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 67 | Avatar / Avatar group | `Avatar` | Usuarios, responsables, equipos | P1 |
| 68 | User card | `UserCard` | Persona con rol, equipo y contacto | P3 |
| 69 | Notification center | `NotificationCenter` | Bandeja de notificaciones | P2 |
| 70 | Comments | `Comments` | Hilo de comentarios en un registro | P3 |

## H. Utilitarios

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 71 | Copy to clipboard | `CopyButton` | Copiar IDs, CUIT, links | P2 |
| 72 | Kbd | `Kbd` | Mostrar atajos de teclado | P3 |
| 73 | Login | `Login` (plantilla) | Pantalla de ingreso con SSO | P2 |

## I. Incorporaciones

| # | Componente | En código | Uso en un sistema interno | Prioridad |
| --- | --- | --- | --- | --- |
| 74 | Grilla de layout | `Grid` · `Col` · `Stack` | Maquetar páginas en 12 columnas con gaps de token | P1 |
| 75 | Filter grid | `FilterGrid` | Formulario de filtros en grilla con Buscar / Limpiar sobre un listado | P1 |
| 76 | Filter dropdown | `FilterDropdown` | Pill de filtro con checklist, la pieza de la `FilterBar` | P1 |
| 77 | Íconos | `Icon` | Set de línea Lucide con los nombres disponibles | P1 |
| 78 | Plantilla de listado | `TemplateList` | Pantalla de consulta completa: filtros, tabla, paginación | P1 |
| 79 | Plantilla de detalle | `TemplateDetail` | Vista de un registro: tabs, ficha, historial, comentarios | P2 |
| 80 | Filtros de tabla (data-table filters) | `ColumnFilter` · `DataTable filterMode` | Filtrar cada columna desde el encabezado o desde una fila de filtros: texto, selección, múltiple, número y fecha | P1 |
