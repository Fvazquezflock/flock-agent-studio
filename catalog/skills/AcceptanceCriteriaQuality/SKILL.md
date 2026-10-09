---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Calidad de criterios de aceptación
description: Criterios verificables y detección de términos ambiguos.
rules:
  - "Términos a evitar: rápido, adecuado, fácil, intuitivo, etc., todo lo necesario, correctamente."
  - Los umbrales propuestos sin respaldo se marcan como supuesto a confirmar.
appliesTo:
  tasks:
    - story_review
    - story_improvements
    - validate_plan
    - qa_coverage
    - generate_stories
tags:
  - calidad
  - criterios
---

# Criterios de aceptación verificables

Cada criterio describe contexto, acción y resultado observable (Dado/Cuando/Entonces).
Reemplazá términos ambiguos por valores medibles: "rápido" → umbral en segundos; "mensaje adecuado" → texto exacto y acción posible.
Incluí al menos un flujo alternativo o de error por historia.
