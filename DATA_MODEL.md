# Modelo de datos

Fuente: `packages/db/prisma/schema.prisma` · Migraciones: `packages/db/prisma/migrations` (`init`, `model_invocations`, `action_rationale`).

## Entidades

| Entidad | Propósito | Notas |
| --- | --- | --- |
| `Project` | Proyecto de la plataforma (clave, proyecto Jira, modo DEMO/JIRA, conexión, proveedor) | |
| `ProjectConfiguration` | Configuración versionada del proyecto (JSON validado) | Única `ACTIVE`; nuevas versiones dejan la anterior `INACTIVE`. Incluye `jira.cancelTransition { id, name }` (transición para cancelar HU) y `jira.discovered.transitions` / `transitionsFrom` (transiciones descubiertas y la historia de muestra) |
| `GlobalSetting` | Configuración global (`global.config`) y registro de archivos de configuración exportados (`catalog.files`) | `global.config`: base de la herencia; reglas obligatorias fijas. `catalog.files` (2026-10-09, sin migración): `{ "<ruta relativa a catalog/>": { hash, history[] } }` con el hash normalizado de lo que la plataforma escribió o aplicó en cada archivo y hasta 50 anteriores; distingue un archivo viejo (`STALE_FILE`) de una edición manual (`CHANGED`). Ver *Archivos de catalog/ y la base* |
| `Connection` | Conexión MCP (stdio/HTTP), mapa de capacidades, escritura habilitada. Puede haber varias conexiones Jira (otros sitios o cuentas) con el mismo servidor | Sin secretos: solo el comando fijo del servidor y `--env-file` (dentro de `MCP/`, terminado en `.env`) |
| `ModelProviderConfiguration` | Proveedores de IA (MOCK, LOCAL_CLAUDE, ANTHROPIC_API) | Solo el nombre de la variable de la API key |
| `Agent` / `AgentVersion` | Agente y sus versiones (definición JSON + checksum) | `activeVersionId` apunta a la versión ACTIVA. La versión activa también está en `catalog/agents/<Clave>.md` |
| `Skill` / `SkillVersion` | Skills versionadas | Activa también en `catalog/skills/<Clave>/SKILL.md` |
| `Orchestrator` / `OrchestratorVersion` / `OrchestratorStep` | Flujos declarativos y etapas materializadas | Activa también en `catalog/orchestrators/<CLAVE>.yaml` |
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

## Archivos de `catalog/` y la base (2026-10-09) — Implementado

Sin cambios de esquema. Los archivos de `catalog/` son la fuente de verdad versionada con git; la base guarda una **copia**:

- **Definiciones**: cada versión de agentes, skills y orquestadores sigue en `*Version` (las ejecuciones fijan versiones; la auditoría, el diff y *Restaurar* las usan), igual que los borradores y las propuestas no aprobadas, que nunca tienen archivo. El archivo refleja solo la versión **activa**: se compara con la base por hash normalizado de la definición, sin registro aparte. Un archivo editado se importa como versión nueva (`changeNote` "Importado desde catalog/<ruta>") en `PENDING_APPROVAL` con su `ApprovalRequest` de activación; si no se puede crear la solicitud, queda en `DRAFT`.
- **Configuración**: `global.yaml` ↔ `GlobalSetting` `global.config`; `policies.yaml` ↔ `ApprovalPolicy` activas (última versión por ámbito, proyecto, orquestador y operación; sin proyectos DEMO); `connections.yaml` ↔ `Connection` (clave, nombre, tipo, propósito y el `--env-file` de `config.args`; nunca `writeEnabled`, `status`, capacidades ni comando); `providers.yaml` ↔ `ModelProviderConfiguration` (sin `MOCK` ni claves con forma de secreto); `projects/<CLAVE>.yaml` ↔ `Project` + `ProjectConfiguration` activa (sin proyectos DEMO). Aplicar un archivo pasa por los servicios habituales: la configuración global, la del proyecto y las políticas suman una versión nueva; los metadatos del proyecto, las conexiones y los proveedores se actualizan como desde la UI.
- **Registro** `GlobalSetting` `catalog.files` (ver *Entidades*): solo para la configuración. La instalación inicial crea las definiciones como v1 `ACTIVE` (`changeNote` "Versión inicial (catalog/<ruta>)").

## Integridad

Claves foráneas con `onDelete: Cascade` solo para hijos (versiones, pasos, eventos, ítems). Unicidades: claves de proyecto/agente/skill/orquestador/conexión/proveedor, `(entidad, versión)`, `(executionId, key)`, `(requestId, itemKey)`, `idempotencyKey`, `(executionId, issueKey)`.
