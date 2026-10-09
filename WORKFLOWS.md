# Orquestadores

Cada orquestador es un archivo YAML versionado con git, `catalog/orchestrators/<CLAVE>.yaml` (fuente de verdad: `EPIC_TO_STORIES_AND_TASKS.yaml` y `STORY_REVIEW_AND_DECOMPOSITION.yaml`), con copia de cada versión en la base (las ejecuciones fijan la versión). Definiciones declarativas versionadas (`OrchestratorDefinition`): nombre, objetivo, condiciones de uso, palabras clave (descubrimiento del supervisor), esquema de entrada, etapas con dependencias, agentes, skills, parámetros, condición `runIf`, reintentos, manejo de errores, condiciones de aprobación y esquema de resultado. Se validan como DAG (sin ciclos, dependencias existentes, publicación solo detrás de una aprobación, agentes que declaren la tarea).

Tipos de etapa (vocabulario ejecutable): `jira.context`, `agent.task`, `supervisor.review`, `approval.gate`, `jira.publish`. Las etapas cuyas dependencias están completas corren en paralelo (si `parallelSafe`).

**Cómo se elige el flujo desde el backlog**: la pantalla *Backlog de Jira* (y `pnpm mao backlog`) ofrece "Analizar épica" con el orquestador activo cuya etapa `jira.context` tiene `params.mode = 'epic'`, y "Validar HU" con el que tiene `mode = 'story'`. Si el proyecto restringe `enabledOrchestrators`, solo se ofrecen los habilitados. La entrada se completa como `epicKey` o `storyKey`.

## A — `EPIC_TO_STORIES_AND_TASKS`

Entrada: `epicKey` (obligatoria), `instructions` (opcional).

```
context → analysis → stories → [tasks_backend | tasks_frontend | tasks_fullstack] → validation → dependencies → review → approval → publish
```

1. **Contexto**: épica, hijos, subtareas, vínculos, tipos de issue y de vínculo (lectura). Snapshot de cada issue. Aviso de contenido sospechoso.
2. **Análisis funcional**: objetivos, capacidades, reglas, faltantes, ambigüedades, preguntas. También puede señalar historias existentes de la épica que sobran (`obsoleteItems`: duplicada, fuera de alcance u obsoleta, con explicación y evidencia).
3. **Historias**: solo para capacidades no cubiertas; plantilla y formato de criterios del proyecto. Cada historia trae su motivo (`rationale`: qué parte de la épica no cubren las existentes) y evidencia.
4. **Descomposición técnica**: tres especialistas en paralelo; cada uno marca *no aplica* cuando corresponde.
5. **Validación QA**: duplicados, contradicciones, historias amplias, criterios faltantes, dependencias, inconsistencias; tareas QA.
6. **Dependencias**: relaciones de bloqueo y olas de trabajo.
7. **Revisión del supervisor**: calidad, conflictos, capacidades faltantes → propuestas en borrador (delegadas a CapabilityDesigner).
8. **Aprobación**: historias, tareas y relaciones como ítems editables (tipos de issue validados contra el proyecto), más el grupo *Historias a cancelar* (ítems `cancel:<CLAVE>`, `TRANSITION_ISSUE`, aprobación individual) para las `obsoleteItems` que de verdad son hijas de la épica (las claves inventadas por el modelo se descartan). Cada ítem muestra su acción (Crear/Modificar/Cancelar) y su motivo: por qué se crea la historia o la tarea, el motivo de cada vínculo o por qué sobra la historia. Rechazar y regenerar vuelve a *stories*.
9. **Publicación**: solo lo aprobado, en orden padre→hijo y con las cancelaciones al final; demo = simulada. Cancelar es una transición real en Jira con un comentario que lleva el motivo; en modo real, sin `jira.cancelTransition` mapeada el ítem se omite con un aviso.

## B — `STORY_REVIEW_AND_DECOMPOSITION`

Entrada: `storyKey` (obligatoria), `objective` (opcional).

```
context → review_story → improvements → [tasks_backend | tasks_frontend | tasks_fullstack] → [qa_coverage | dependencies] → review → approval → publish
```

- **Validación funcional**: claridad, completitud, coherencia, ambigüedades, criterios, flujos alternativos, validaciones, dependencias y Definition of Ready, con severidad y evidencia. Si la HU sobra (duplicada, fuera de alcance u obsoleta), lo indica en `cancellation` con explicación, evidencia y, si duplica, la clave original.
- **Mejoras**: título/descripción/criterios con texto original, propuesto y justificación.
- **Tareas**: comparadas con las subtareas existentes (`duplicateOf`), sin duplicar; cada una trae su motivo (`rationale`).
- **Evaluación cruzada** en paralelo: cobertura QA y plan de dependencias.
- **Aprobación por separado**: *Cambios en la HU* (aprobación individual), *Historias a cancelar* (ítem `cancel:<CLAVE>`, aprobación individual), *Tareas nuevas* y *Relaciones* (por lote). El ítem de cambios en la HU lleva como motivo las inconsistencias concretas que encontró la validación (severidad y evidencia) y la justificación de cada cambio; los demás, por qué se crean o por qué se cancela la HU.
- **Publicación**: antes de actualizar o cancelar la HU se compara su versión actual con la leída; si cambió, se detiene esa escritura y se genera una solicitud *Revisión por conflicto* con el contenido actual de Jira (conserva tipo de operación, acción y motivo). La publicación recuerda las issues que ella misma modificó para no tomarlas como conflicto, y la cancelación se ejecuta al final.

**Acción, motivo y cancelaciones** (implementado 2026-10-09): en los dos flujos cada ítem de aprobación guarda `action` y `rationale` (ver DATA_MODEL.md). El modelo simulado no propone cancelar historias por sí solo (pendiente): las cancelaciones salen del modelo real o de las pruebas. Para cancelar en un Jira real hay que mapear la transición del proyecto (ver README.md, *Aprobaciones: qué se propone y por qué*).

## Crear orquestadores

UI → *Orquestadores → Nuevo* (borrador) → editor por formulario con diagrama → *Validar* → *Solicitar activación* → aprobar. Nada se ejecuta hasta que la versión está activa. Al aprobar la activación, la plataforma escribe `catalog/orchestrators/<CLAVE>.yaml`.

**Desde el archivo** (2026-10-09, implementado): editar `catalog/orchestrators/<CLAVE>.yaml`, o crear uno con una clave nueva (el nombre del archivo es la clave), y sincronizar (arranque de la API, `pnpm mao files sync` o *Configuración → Archivos → Sincronizar*). Se valida igual que desde la UI (DAG, dependencias, agentes que declaran la tarea, skills existentes) y se importa como versión nueva **pendiente de aprobación** con su solicitud de activación (`ACTIVATE_ORCHESTRATOR`: aprobación individual obligatoria por el piso de seguridad); nunca se activa solo. Un archivo inválido queda *Inválido* y no se importa; si se rechaza la activación, el archivo vuelve a la versión activa. Borrar el archivo no desactiva el orquestador (se vuelve a escribir desde la base); desactivarlo desde la UI borra el archivo.
