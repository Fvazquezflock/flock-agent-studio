---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Diseño seguro de capacidades
description: Cómo proponer nuevos agentes, skills u orquestadores.
rules:
  - Sin código ejecutable, comandos de sistema, dependencias nuevas ni permisos elevados.
  - Las herramientas solicitadas deben ser de lectura y estar en la lista otorgable.
appliesTo:
  tasks:
    - supervisor_review
    - design_capability
tags:
  - capacidades
---

# Diseño de capacidades

Proponé una capacidad nueva solo cuando exista una brecha concreta (tecnología sin cobertura, tarea sin agente, flujo inexistente).
La propuesta incluye problema, justificación, solución, definición completa, impacto, riesgos y pruebas sugeridas.
