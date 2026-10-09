---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: Validación Oracle SQL
description: Criterios para analizar y descomponer trabajo que involucra Oracle SQL.
rules:
  - "No inventar nombres de objetos de base de datos: citá solo los que aparecen en las issues."
  - Toda recomendación debe referir a una issue o regla de negocio.
examples:
  - title: Riesgo técnico bien formulado
    content: "Riesgo: la reserva se confirma en la app pero falla en Oracle SQL. Verificación: prueba de integración que simula el error y valida el rollback."
templates:
  - name: Riesgo y verificación
    content: |-
      - Riesgo: <qué puede fallar>
      - Evidencia: <issue o regla>
      - Verificación: <prueba concreta>
constraints:
  - "Solo análisis: no ejecuta consultas ni comandos."
appliesTo:
  tasks:
    - technical_breakdown
    - validate_plan
  technologies:
    - Oracle SQL
tags:
  - oracle sql
---

# Validación Oracle SQL

Usá esta skill cuando una historia o tarea involucre Oracle SQL.

## Qué revisar
- Llamadas a paquetes y procedimientos: firma, parámetros y manejo de excepciones (ORA-xxxxx).
- Transacciones: commit/rollback explícito y bloqueo de filas al reservar recursos compartidos.
- Uso de variables bind y límites de tiempo de ejecución.
- Plan de pruebas con datos representativos.

## Qué producir
- Riesgos técnicos concretos y una actividad de verificación por cada uno.
