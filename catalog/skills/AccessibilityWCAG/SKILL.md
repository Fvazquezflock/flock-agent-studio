---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: AccessibilityWCAG
description: Skill declarativa para especificar y verificar accesibilidad WCAG 2.1 AA en historias de UI del portal, con checklist, plantillas de ACs por tipo de pantalla y protocolo de verificación mixto (automatizado más manual).
rules:
  - La historia debe fijar `auditTool` con `name` y `version`; sin eso, los ACs de accesibilidad no son válidos.
  - La auditoría automatizada debe reportar 0 violaciones críticas o serias para considerar el AC cumplido.
  - La verificación manual (teclado, lector, contraste) es obligatoria y no reemplazable por la automatizada.
  - Los ACs derivados deben citar los criterios WCAG aplicables por número (por ejemplo 1.4.3).
  - La evidencia (reporte automatizado más checklist manual firmado por QA) debe quedar listada como AC explícito.
examples:
  - title: S6-AC3 medible
    content: "Dado un formulario de alta, cuando se audita con auditTool={name: axe-core, version: X.Y.Z}, entonces el reporte muestra 0 violaciones críticas o serias y se adjunta junto al checklist manual firmado por QA cubriendo 2.1.1, 2.4.7, 1.4.3, 3.3.1 y 3.3.3."
  - title: Instanciación pantallaListado
    content: "ACs derivados: orden de foco coincide con orden visual (2.4.3); encabezados de tabla con relaciones semánticas (1.3.1); filtros operables por teclado (2.1.1); contraste AA en celdas y bordes (1.4.3, 1.4.11); evidencia: reporte auditTool más checklist manual."
templates:
  - name: pantallaFormulario
    content: "ACs: 1) Navegación completa por teclado (2.1.1, 2.4.3). 2) Foco visible en todos los controles (2.4.7). 3) Etiquetas asociadas y nombre/rol/valor correctos (1.3.1, 4.1.2). 4) Errores identificados por texto y aria (3.3.1) con sugerencia de corrección (3.3.3). 5) Contraste AA (1.4.3, 1.4.11) sin depender solo del color (1.4.1). 6) Evidencia: reporte {{auditTool.name}}@{{auditTool.version}} con 0 violaciones críticas/serias más checklist manual firmado por QA."
  - name: pantallaListado
    content: "ACs: 1) Encabezados y relaciones semánticas (1.3.1, 2.4.6). 2) Orden de foco lógico (2.4.3). 3) Filtros y paginación operables por teclado (2.1.1) con foco visible (2.4.7). 4) Estados anunciados por lector (4.1.2). 5) Contraste AA (1.4.3, 1.4.11). 6) Evidencia: reporte {{auditTool.name}}@{{auditTool.version}} más checklist manual."
  - name: pantallaNavegacion
    content: "ACs: 1) Landmarks y encabezados (1.3.1, 2.4.6). 2) Menús operables por teclado con escape (2.1.1). 3) Foco visible (2.4.7) y página actual no solo por color (1.4.1). 4) Skip link al contenido principal (2.4.3). 5) Animaciones controlables (2.2.2, 2.3.3). 6) Evidencia: reporte {{auditTool.name}}@{{auditTool.version}} más checklist manual."
constraints:
  - No incluir código ejecutable, comandos ni dependencias nuevas.
  - "No fijar una herramienta de auditoría concreta desde la skill: la elige la historia vía `auditTool`."
  - No sustituir criterios WCAG por interpretaciones propias; referenciar siempre el número de criterio.
  - Aplicable a UI del portal; no cubre accesibilidad de documentos PDF u otros formatos no-web.
appliesTo:
  tasks:
    - generate_stories
    - story_review
    - story_improvements
    - qa_coverage
  technologies:
    - web-ui
tags:
  - accesibilidad
  - wcag
  - ui
  - portal
  - qa
---

# Accesibilidad WCAG 2.1 AA verificable

## Alcance
Aplica a toda historia de UI del portal cuyos ACs incluyan requisitos de accesibilidad. La historia debe fijar el parámetro `auditTool` con nombre y versión (por ejemplo `axe-core@<versión>`).

## Checklist WCAG 2.1 AA
- Teclado: 2.1.1 (operable por teclado), 2.4.3 (orden de foco lógico).
- Foco visible: 2.4.7 (indicador de foco perceptible).
- Lector de pantalla: 1.1.1 (texto alternativo), 4.1.2 (nombre, rol y valor).
- Contraste y color: 1.4.3 (contraste mínimo 4.5:1 texto normal, 3:1 texto grande), 1.4.11 (contraste de componentes 3:1), 1.4.1 (no depender solo del color).
- Formularios: 3.3.1 (identificación de errores), 3.3.3 (sugerencia de corrección).
- Estructura: 1.3.1 (información y relaciones semánticas), 2.4.6 (encabezados y etiquetas descriptivos).
- Movimiento: 2.2.2 (pausar/detener/ocultar), 2.3.3 (animaciones por interacción).

## Plantillas de ACs por tipo de pantalla
- `pantallaFormulario`: navegación completa por teclado; foco visible en todos los controles; etiquetas asociadas a cada campo; errores identificados por texto y por `aria-*`; sugerencia de corrección; contraste AA en textos y bordes.
- `pantallaListado`: encabezados y relaciones semánticas correctas; orden de foco coincide con orden visual; filtros y paginación operables por teclado; estados (seleccionado, cargando) anunciados por lector.
- `pantallaNavegacion`: landmarks presentes; menú operable por teclado y escape para cerrar; indicador de página actual no solo por color; skip link al contenido principal.

## Parámetro obligatorio
`auditTool`: objeto con `name` y `version`. La historia que use esta skill debe fijarlo; sin este dato, la skill no se considera aplicable.

## Protocolo de verificación
1. Auditoría automatizada con `auditTool`: debe reportar 0 violaciones de severidad crítica o seria sobre la pantalla cubierta por la historia.
2. Verificación manual obligatoria: recorrido completo por teclado, prueba con lector de pantalla y validación de contraste en estados por defecto, hover, foco y deshabilitado.
3. Evidencia requerida: reporte exportado de la auditoría automatizada más checklist manual firmado por QA, ambos adjuntos a la historia.

## Instanciación en una historia
- Elegir la plantilla correspondiente al tipo de pantalla.
- Derivar los ACs listando los criterios WCAG aplicables del checklist.
- Incluir el AC de evidencia (reporte más checklist manual).
- Fijar `auditTool.name` y `auditTool.version`.
