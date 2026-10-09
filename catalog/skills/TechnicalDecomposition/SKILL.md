---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Descomposición técnica
description: Cómo dividir una historia en tareas por especialidad.
rules:
  - "No crear tareas Backend y Frontend por reflejo: justificar cada una."
  - Las tareas de frontend dependen del contrato de API cuando lo consumen.
appliesTo:
  tasks:
    - technical_breakdown
tags:
  - tecnica
  - tareas
---

# Descomposición técnica

Proponé tareas solo de tu especialidad y solo si aportan valor. Cada tarea tiene objetivo, alcance, actividades, criterios de finalización, dependencias y riesgos.
Si una tarea equivale a una existente en Jira, indicá su clave en duplicateOf en lugar de proponerla de nuevo.
