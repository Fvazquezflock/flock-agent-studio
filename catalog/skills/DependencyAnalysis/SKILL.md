---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Análisis de dependencias
description: Relaciones de bloqueo y orden de trabajo.
rules:
  - No crear ciclos.
  - "Preferir relaciones mínimas: no vincular lo que ya está implícito por jerarquía."
appliesTo:
  tasks:
    - dependency_plan
    - validate_plan
tags:
  - dependencias
---

# Dependencias

Una relación "bloquea" existe solo si el trabajo B no puede empezar o terminar sin A. Explicá el motivo de cada relación y agrupá el trabajo en olas paralelizables.
