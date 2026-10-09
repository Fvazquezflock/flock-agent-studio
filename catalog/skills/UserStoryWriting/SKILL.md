---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Redacción de historias de usuario
description: Formato, granularidad y criterios para historias de usuario.
rules:
  - Una historia = una capacidad observable por el actor.
  - Si una historia necesita más de 6 criterios, probablemente hay que dividirla.
  - Las dudas de negocio van como preguntas abiertas, nunca como supuestos silenciosos.
examples:
  - title: Título correcto
    content: Cancelar un turno hasta 2 horas antes del horario reservado
templates:
  - name: Historia
    content: |-
      Como <actor> quiero <capacidad> para <beneficio>.

      ## Criterios de aceptación
      - Dado <contexto>, cuando <acción>, entonces <resultado observable>.
appliesTo:
  tasks:
    - generate_stories
    - story_improvements
    - functional_analysis
tags:
  - historias
  - agil
---

# Redacción de historias de usuario

Usá el formato "Como <actor> quiero <capacidad> para <beneficio>".
Cada historia debe ser independiente, negociable, valiosa, estimable, chica y testeable (INVEST).
El título empieza con un verbo en infinitivo y describe la capacidad, no la solución técnica.
