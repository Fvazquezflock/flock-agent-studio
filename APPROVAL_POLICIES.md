# Políticas de aprobación

Las aplica **siempre el backend** (`PolicyService`, `ApprovalService`, `PublicationService`); nunca dependen de lo que diga un modelo.

## Modos

| Modo | Efecto |
| --- | --- |
| `ALWAYS_APPROVE` | Cada operación se aprueba individualmente (una decisión por ítem). |
| `BATCH_APPROVAL` | Se aprueba un conjunto, con selección individual. |
| `AUTO_APPROVED` | Autorizada por política previa (queda registrada como decisión del sistema con la política aplicada). |
| `DENIED` | Prohibida. |

## Valores por defecto (globales)

| Operación | Modo | Obligatoria |
| --- | --- | --- |
| Consultar información (`READ_EXTERNAL`) | AUTO_APPROVED | |
| Generar propuestas (`GENERATE_PROPOSAL`) | AUTO_APPROVED | |
| Crear issues (`CREATE_ISSUE`) | BATCH_APPROVAL | |
| Crear relaciones (`CREATE_ISSUE_LINK`) | BATCH_APPROVAL | |
| Editar issues (`UPDATE_ISSUE`) | ALWAYS_APPROVE | |
| Cancelar issues en Jira (transición de estado) (`TRANSITION_ISSUE`) | ALWAYS_APPROVE | |
| Modificar agentes activos / activar agentes | ALWAYS_APPROVE | |
| Activar skills / orquestadores | ALWAYS_APPROVE | Sí |
| Aprobar propuestas de capacidades | ALWAYS_APPROVE | |
| Eliminar información (`DELETE_EXTERNAL`) | DENIED | Sí |

**Piso de seguridad en código** (no editable desde la base): eliminar = DENIED; cancelar issues (`TRANSITION_ISSUE`), activar skills/orquestadores y aprobar propuestas = ALWAYS_APPROVE; activar/modificar agentes ≥ BATCH_APPROVAL.

**Cancelar una HU** (implementado 2026-10-09): es una transición real en Jira hacia el estado mapeado en `jira.cancelTransition` del proyecto, nunca un borrado (`DELETE_EXTERNAL` sigue DENIED y `jira_delete_issue` no se mapea). Por el piso, cada cancelación (ítem `cancel:<CLAVE>`, grupo *Historias a cancelar*) se aprueba individualmente aunque se use la aprobación en lote para el resto. Al publicar: en modo real, sin transición mapeada el ítem se omite con un aviso; antes de transicionar se verifica que la HU no haya cambiado (si cambió → *Revisión por conflicto*, que conserva tipo de operación, acción y motivo); las cancelaciones se ejecutan al final.

**Propuestas de capacidades**: la solicitud trae el plan como ítems dependientes (crear versión → activar → asignar al proyecto de origen con `MODIFY_AGENT_CONFIG`). *Confirmar e implementar* (UI o API, con el hash del plan revisado) registra **una decisión individual por paso** con el mismo aprobador; no aprueba en lote ni relaja políticas. Los efectos se aplican recién cuando todos los pasos están decididos, en la transacción de la última decisión. Según la acción de la propuesta, el plan cambia: **crear** (crear versión → activar → asignar), **modificar** (nueva versión de la capacidad existente → activar → asignar si el proyecto de origen no la tenía) o **cancelar** (quitar la skill del proyecto de origen con `MODIFY_AGENT_CONFIG` → desactivarla en el catálogo con la operación de activación del tipo). Modificar o cancelar exige que la capacidad exista; el supervisor principal no se puede cancelar.

## Resolución

Global → proyecto → operación (proyecto + orquestador). Gana la más específica, salvo que una global **obligatoria** sea más estricta o el piso lo impida. Un proyecto no puede registrar una política que relaje una obligatoria (se rechaza con `AUTHORIZATION_ERROR`). Cada cambio crea una nueva versión y queda auditado.

## Ciclo de una solicitud

1. La etapa `approval.gate` crea la solicitud con **snapshot inmutable** (y su hash) y un ítem por operación, con la política resuelta en ese momento, su acción (`CREATE`, `UPDATE` o `CANCEL`) y su motivo (por qué, evidencia y, si corresponde, las inconsistencias encontradas). DENIED → ítem denegado; AUTO_APPROVED → decisión del sistema.
2. Editar un ítem crea una **revisión** (historial) y recalcula su hash; si estaba aprobado, vuelve a PENDING (hay que aprobar de nuevo).
3. Decidir exige el **hash vigente** (`confirmHash`; obligatorio desde la CLI/Claude Code). La política se reevalúa al decidir. Aprobar algo que depende de un ítem rechazado falla; rechazar propaga el rechazo a los dependientes.
4. Cada decisión persiste aprobador, canal, comentario, fecha y por ítem: revisión, hash, política, modo y versión.
5. Al publicar, `PublicationService` vuelve a verificar: ítem aprobado, `approvedHash == payloadHash == hash(payload)`, política vigente (DENIED bloquea; AUTO_APPROVED ya no permitido bloquea) y escritura habilitada (conexión + `MAO_ALLOW_JIRA_WRITES`). Lo rechazado queda en la auditoría como `WRITE_REJECTED`.

## Idempotencia y reconciliación

Clave interna `sha256(ejecución | ítem | hash del payload resuelto)`. Una operación ya `SUCCEEDED/SIMULATED` no se repite. Si el resultado fue incierto (timeout/desconexión), antes de reintentar se busca en Jira (etiqueta de correlación + resumen; estado actual para updates; vínculos existentes).

## Propietario

MVP con un único propietario local (`MAO_OWNER_NAME`) autenticado por token. La arquitectura registra actor y canal en cada acción para incorporar usuarios y roles más adelante.
