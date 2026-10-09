---
# Skill del catálogo. El cuerpo (debajo del segundo ---) son las instrucciones.
# Editar este archivo crea una versión pendiente de aprobación al sincronizar: nunca se activa sola.
name: IntegrationResiliencePatterns
description: Skill declarativa para analizar historias con integraciones salientes y proponer preguntas, supuestos y criterios de aceptación sobre reintentos, idempotencia, estado pendiente, alertas y conciliación.
rules:
  - "No inventar valores concretos: N, backoff, frecuencia, destinatarios y canales se marcan como supuesto o pregunta abierta."
  - No proponer tecnologías ni componentes de implementación.
  - Detenerse y pedir aclaración si falta sistema destino o la operación invocada.
  - Si la historia no involucra integración saliente, devolver 'no aplica' sin generar ACs.
examples:
  - title: Historia S5/BE-S5-1 con CRM
    content: La historia menciona reintentos y conciliación con CRM. La skill emite preguntas sobre clasificación de errores, N y backoff, clave idempotente, estado pendiente, destinatario de alerta y frecuencia de conciliación, y propone ACs parametrizados sin fijar valores.
  - title: Historia sin integración saliente
    content: La historia solo describe cálculo local. La skill devuelve 'no aplica'.
  - title: Historia con destino no especificado
    content: Se menciona 'sincronizar con sistema externo' sin nombrar sistema u operación. La skill se detiene y solicita identificar sistema destino y operación antes de proponer ACs.
templates:
  - name: AC-reintento
    content: Dado un error transitorio al invocar <sistema>, cuando ocurre la falla, entonces se reintenta hasta <N:supuesto> veces con backoff <X:supuesto>.
  - name: AC-idempotencia
    content: Dado el reenvío del mismo evento con clave <K>, cuando el destino lo recibe, entonces no se duplica el efecto.
  - name: AC-pendiente
    content: Mientras no se confirma la sincronización con <sistema>, la entidad local figura como 'pendiente de sincronización'.
  - name: AC-alerta
    content: Dado que se agotaron los reintentos, cuando ocurre el fallo definitivo, entonces se notifica al responsable <R:supuesto> por el canal <C:supuesto>.
  - name: AC-conciliacion
    content: La conciliación con <sistema> corre cada <F:supuesto> y resuelve divergencias según el criterio <D:supuesto>.
constraints:
  - "Skill declarativa: sin código, comandos ni dependencias."
  - No asumir componentes no evidenciados en la historia.
  - No incluir valores numéricos sin marcarlos como supuesto o pregunta.
appliesTo:
  tasks:
    - functional_analysis
    - generate_stories
    - technical_breakdown
    - validate_plan
    - story_review
    - story_improvements
    - qa_coverage
tags:
  - integracion
  - resiliencia
  - reintentos
  - idempotencia
  - conciliacion
  - alertas
---

# Patrones de resiliencia de integraciones

Activá esta skill cuando la historia o tarea técnica mencione: llamada a un sistema externo, reintentos, sincronización, conciliación, o riesgo de pérdida de evento ante caída del destino.

## Alcance
Integraciones salientes a sistemas externos (por ejemplo CRM) con necesidad de entrega eventual, idempotencia y visibilidad de fallas.

## Patrones cubiertos
- P1 Reintento acotado con backoff ante errores transitorios.
- P2 Idempotencia por clave provista por el emisor.
- P3 Estado local 'pendiente de sincronización' mientras no se confirma el destino.
- P4 Alerta al responsable al agotar reintentos.
- P5 Conciliación periódica para resolver divergencias.

## Procedimiento
1. Verificar que exista integración saliente real. Si no, devolver 'no aplica'.
2. Verificar que el sistema destino y la operación estén identificados. Si falta, detenerse y pedir el dato.
3. Para cada patrón aplicable, emitir las preguntas estándar y, si hay respuesta, un AC parametrizable.
4. Marcar explícitamente como 'supuesto' o 'pregunta abierta' cualquier valor concreto (N intentos, segundos, frecuencias, destinatarios).

## Preguntas estándar
- ¿Cómo se clasifica un error como transitorio vs. permanente?
- ¿Cuál es el N máximo de intentos y la estrategia de backoff?
- ¿Qué clave idempotente se usa y quién la genera?
- ¿Qué estado local tiene la entidad mientras está pendiente?
- ¿Quién es el responsable notificado y por qué canal al agotar reintentos?
- ¿Con qué frecuencia y criterio corre la conciliación?
- ¿Cuál es el SLA de propagación esperado?
- ¿Cómo se tratan los fallos definitivos (descartar, cuarentena, intervención manual)?

## Plantilla de criterios de aceptación
- Dado un error transitorio al invocar <sistema>, se reintenta hasta <N> veces con backoff <X>.
- Dado el reenvío del mismo evento con clave <K>, el destino no duplica el efecto.
- Mientras no se confirma la sincronización, la entidad local figura como 'pendiente de sincronización'.
- Al agotar los reintentos se notifica al responsable <R> por el canal <C>.
- La conciliación corre cada <F> y resuelve divergencias según el criterio <D>.
