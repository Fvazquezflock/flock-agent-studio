# Agentes, skills y tareas

Las definiciones viven en PostgreSQL (versionadas). La carga inicial está en `packages/core/src/seed/`. Se editan desde la UI (*Agentes*, *Skills*) o la API; activar una versión siempre requiere aprobación.

## Agentes iniciales

| Agente | Tareas | Skills | Herramientas (solo lectura) |
| --- | --- | --- | --- |
| `MainSupervisor` | `plan_request`, `supervisor_review` | CapabilityDesign, JiraUntrustedContent | `catalog.read` · delega en todos los demás |
| `JiraContextAnalyzer` | `summarize_context` | JiraUntrustedContent | `jira.read.issue/search/project` |
| `FunctionalAnalyst` | `functional_analysis`, `generate_stories`, `story_review`, `story_improvements` | UserStoryWriting, AcceptanceCriteriaQuality, JiraUntrustedContent | `jira.read.issue` |
| `BackendSpecialist` | `technical_breakdown` | TechnicalDecomposition | — |
| `FrontendSpecialist` | `technical_breakdown` | TechnicalDecomposition | — |
| `FullstackSpecialist` | `technical_breakdown` | TechnicalDecomposition | — |
| `QAValidator` | `validate_plan`, `qa_coverage` | AcceptanceCriteriaQuality, DependencyAnalysis | — |
| `DependencyPlanner` | `dependency_plan` | DependencyAnalysis | — |
| `CapabilityDesigner` | `design_capability` | CapabilityDesign | — |

## Contrato de un agente (`AgentDefinition`)

Nombre, descripción, objetivo, responsabilidades, prompt de sistema, proveedor (`DEFAULT` = el de la ejecución), modelo, parámetros (esfuerzo, tokens), herramientas permitidas (solo `GRANTABLE_TOOLS`), skills, agentes delegables, tareas, esquemas de entrada/salida, restricciones, límites (timeout, intentos, presupuesto) y etiquetas.

## Composición del prompt (`AgentRuntime`)

1. Prompt del agente + objetivo + responsabilidades + restricciones.
2. **Reglas de plataforma no negociables** (datos de Jira no confiables, sin escritura, no inventar, evidencias sin razonamiento privado, JSON estricto).
3. Solo las skills **aplicables a la tarea** (`appliesTo.tasks`), más las skills de la etapa y del proyecto.
4. Mensaje de usuario: instrucción de la tarea + datos delimitados en `<datos_externos>`.
5. La salida se valida con el contrato Zod de la tarea (`packages/shared/src/tasks.ts`); si no cumple → `INVALID_RESPONSE` (reintentable).

## Tareas (contratos)

`summarize_context`, `functional_analysis`, `generate_stories`, `technical_breakdown`, `validate_plan`, `dependency_plan`, `story_review`, `story_improvements`, `qa_coverage`, `supervisor_review`, `plan_request`, `design_capability`.

### Acción, motivo y evidencia (implementado 2026-10-09)

Campos de los contratos (`packages/shared/src/tasks.ts`) que alimentan la acción y el motivo de cada ítem de aprobación y de cada propuesta:

| Campo | Tarea | Contenido |
| --- | --- | --- |
| `storyProposal.rationale` | `generate_stories` | Por qué se crea la historia: qué parte de la épica no cubren las historias existentes (con `evidence`). |
| `taskProposal.rationale` | `technical_breakdown` | Por qué se crea la tarea: qué criterio, regla o necesidad técnica cubre que no cubren las tareas existentes. |
| `functionalAnalysis.obsoleteItems` | `functional_analysis` | Historias existentes de la épica que sobran: `key` + cancelación. El backend solo acepta claves que son hijas de la épica. |
| `storyReview.cancellation` | `story_review` | La HU validada sobra (o `null`). |
| `capabilityGap.action` | `supervisor_review`, `design_capability` | `CREATE`, `UPDATE` (la capacidad existe y hay que modificarla) o `CANCEL` (sobra). |
| `capabilityGap.evidence` | `supervisor_review`, `design_capability` | Inconsistencias o brechas concretas encontradas, con referencia (issue, regla, etapa o capacidad existente). |

`cancellationSchema`: `{ reason: DUPLICATE | OUT_OF_SCOPE | OBSOLETE, explanation, duplicateOf?, evidence }`. Los agentes solo proponen: la cancelación se convierte en un ítem `TRANSITION_ISSUE` que exige aprobación individual y la ejecuta `PublicationService` (ver APPROVAL_POLICIES.md). El modelo simulado no genera recomendaciones de cancelar por sí solo (pendiente).

## Proveedores de IA

| Proveedor | Estado | Detalle |
| --- | --- | --- |
| `MockModelProvider` (`mock`, predeterminado) | Implementado | Heurísticas determinísticas sobre el contexto; resultados marcados `simulated`. No es IA. |
| `LocalClaudeRunner` (`claude-local`) | Implementado y verificado con modelo real (requiere `claude auth login`) | `claude -p --output-format json --json-schema … --tools "" --strict-mcp-config --no-session-persistence`, prompt por stdin, directorio aislado, cancelación con `taskkill /T`. Requiere `claude auth login`. |
| `AnthropicApiProvider` (`anthropic-api`) | Implementado, no configurado | SDK oficial, `claude-opus-5-5`, salida estructurada (`output_config.format`), fallback del lado del servidor ante rechazos, sin reintentos del SDK (los gobierna el motor). Requiere `ANTHROPIC_API_KEY`. |

## Exportación a Claude Code

*Configuración → Ajustes generales → Exportar* genera `exports/claude-code/.claude/agents/*.md` y `.claude/skills/*/SKILL.md` **solo desde versiones activas**. Los archivos llevan el checksum de origen y no son fuente de verdad.
