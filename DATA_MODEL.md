# Modelo de datos

Fuente: `packages/db/prisma/schema.prisma` · Migraciones: `packages/db/prisma/migrations` (`init`, `model_invocations`, `action_rationale`).

## Entidades

| Entidad | Propósito | Notas |
| --- | --- | --- |
| `Project` | Proyecto de la plataforma (clave, proyecto Jira, modo DEMO/JIRA, conexión, proveedor) | |
| `ProjectConfiguration` | Configuración versionada del proyecto (JSON validado) | Única `ACTIVE`; nuevas versiones dejan la anterior `INACTIVE`. Incluye `jira.cancelTransition { id, name }` (transición para cancelar HU) y `jira.discovered.transitions` / `transitionsFrom` (transiciones descubiertas y la historia de muestra) |
| `GlobalSetting` | Configuración global (`global.config`) | Base de la herencia; reglas obligatorias fijas |
| `Connection` | Conexión MCP (stdio/HTTP), mapa de capacidades, escritura habilitada | Sin secretos: solo comando y `--env-file` |
| `ModelProviderConfiguration` | Proveedores de IA (MOCK, LOCAL_CLAUDE, ANTHROPIC_API) | Solo el nombre de la variable de la API key |
| `Agent` / `AgentVersion` | Agente y sus versiones (definición JSON + checksum) | `activeVersionId` apunta a la versión ACTIVA |
| `Skill` / `SkillVersion` | Skills versionadas | |
| `Orchestrator` / `OrchestratorVersion` / `OrchestratorStep` | Flujos declarativos y etapas materializadas | |
| `CapabilityProposal` / `CapabilityProposalRevision` | Propuestas de capacidades y sus revisiones. `action` (`CREATE`, `UPDATE`, `CANCEL`; por defecto `CREATE`) define el plan (crear, nueva versión o quitar del proyecto y desactivar); `evidence` (`String[]`) guarda las inconsistencias o brechas encontradas | `action` y `evidence` desde la migración `action_rationale` |
| `Execution` | Ejecución: origen, entrada, snapshot de versiones, simulación, lease | `number` legible (EX-n) |
| `ExecutionStep` | Etapa: estado, intentos, salida, decisiones/evidencias, uso | Única por `(executionId, key)` |
| `ExecutionEvent` | Evento persistido (id incremental para SSE) | |
| `ModelInvocation` | Consumo por invocación de modelo: origen (`EXECUTION`, `SUPERVISOR_PLAN`, `CATALOG_TEST`), ejecución/etapa/intento, agente, tarea, proveedor, modelo, resultado (`OK` o `INVALID_RESPONSE`), tokens de entrada, salida, caché escrita y caché leída, costo estimado | Se registra también la respuesta fuera de contrato. Migración `model_invocations` con relleno desde `ExecutionStep.decisions` (sin desglose de caché) |
| `ApprovalPolicy` | Política por ámbito/operación, versionada | |
| `ApprovalRequest` | Solicitud con snapshot inmutable + hash | `number` (AP-n) |
| `ApprovalItem` | Operación aprobable: payload vigente, revisión, historial, política. `action` (`CREATE`, `UPDATE`, `CANCEL`; texto nullable) y `rationale` (JSON `{ reason, evidence[], inconsistencies?[{ id, severity, description, evidence }] }`): qué se hace y por qué | `approvedHash` debe coincidir para publicar. `action`/`rationale` desde la migración `action_rationale`, que rellena `action` de los ítems existentes según el tipo de operación y el motivo de los vínculos desde su payload. La revisión por conflicto los conserva |
| `ApprovalDecision` | Decisión inmutable: aprobador, canal, ítems con hash y política aplicada | |
| `ExternalOperation` | Operación en Jira (o simulada): clave de idempotencia, correlación, resultado | Única por `idempotencyKey` |
| `IssueSnapshot` | Copia de cada issue leída (marca `updated` + hash) | Detección de conflictos |
| `AuditEvent` | Auditoría append-only sanitizada | |
| `WorkerHeartbeat` | Latido de cada worker | Estado de servicios |

## Versionado y trazabilidad

- Definiciones inmutables salvo `DRAFT`; estados `DRAFT, PENDING_APPROVAL, APPROVED, ACTIVE, INACTIVE, REJECTED, ARCHIVED`.
- `Execution.snapshot` fija: versión del orquestador, configuración del proyecto y global, versiones de todos los agentes y skills activos, políticas activas y proveedor. Una activación posterior no altera ejecuciones existentes.
- `ExecutionStep.decisions` guarda agente+versión, skills+versiones, proveedor, modelo, simulación y uso. **No** se guarda razonamiento interno del modelo.

## Integridad

Claves foráneas con `onDelete: Cascade` solo para hijos (versiones, pasos, eventos, ítems). Unicidades: claves de proyecto/agente/skill/orquestador/conexión/proveedor, `(entidad, versión)`, `(executionId, key)`, `(requestId, itemKey)`, `idempotencyKey`, `(executionId, issueKey)`.
