# PROGRESS — Multi-Agent Orchestration Studio

Documento de traspaso. Si retomás el trabajo (otra persona, otra PC u otra sesión de Claude Code), empezá por acá.
Última actualización: 2026-10-09 — MVP completo y verificado (fases 0 a 6). Base de trabajo migrada a PostgreSQL en Railway.

## Estado por fase

| Fase | Estado | Notas |
| --- | --- | --- |
| 0 — Inspección | Implementado | Ver "Hallazgos del entorno" |
| 1 — Infraestructura | Implementado | Monorepo pnpm, Prisma (migración `init`), Postgres embebido, API, worker, CLI, scripts PowerShell |
| 2 — Núcleo multiagente | Implementado | Catálogo versionado, motor persistente, aprobaciones, políticas, auditoría, proveedores, eventos SSE |
| 3 — Orquestadores Jira | Implementado | A y B de punta a punta en demo; B verificado contra Jira real (solo lectura) |
| 4 — Administración y supervisión (UI) | Implementado | 9 pantallas + detalle de cada entidad, contra endpoints reales |
| 5 — Autoevolución supervisada | Implementado | Supervisor → CapabilityDesigner → propuesta → aprobación → versión aprobada → activación aprobada |
| 6 — Verificación final | Implementado | 63 pruebas, typecheck, build, CLI/UI, MCP en vivo, permisos |
| 7 — Base en Railway | Implementado | `DATABASE_URL` remota con TLS, datos locales copiados, flujo A verificado contra Railway |
| 8 — Primera corrida sobre Jira real | Parcial | Épica `SCRUM-5` + HU `SCRUM-6..10` creadas; flujos A y B corridos con modelo simulado; bug de dirección de vínculos corregido. Falta corrida con modelo real (ya disponible) |
| 9 — Backlog de Jira | Implementado | Listar épicas e HU para elegir qué analizar: UI `/backlog`, API y `pnpm mao backlog` |
| 10 — Menú de operación / configuración | Implementado | Operación arriba; todo lo demás en el grupo desplegable *Configuración* del pie (patrón de ítem anidado del `Sidebar` del design system) |
| 11 — Consumo de tokens | Implementado | Registro por invocación (con caché y respuestas fuera de contrato), por agente/ejecución/general en UI, API y CLI |
| 12 — Propuestas: "confirmo y se configura sola" | Implementado | Plan crear → activar → asignar al proyecto de origen; una confirmación registra la aprobación individual de cada paso; "Regenerar diseño" |
| 13 — Acción y motivo; cancelar por transición | Implementado | Cada ítem de aprobación y cada propuesta indica Crear/Modificar/Cancelar y por qué (con evidencia e inconsistencias); cancelar una HU es una transición real en Jira (`TRANSITION_ISSUE`, siempre aprobación individual). `SCRUM` no tiene estado de cancelación; la CLI todavía no muestra acción ni motivo |

## Acción y motivo en cada propuesta; cancelar HU por transición (2026-10-09) — Implementado

Migración `20261009185956_action_rationale` **aplicada en Railway** (`migrate deploy`) y seed idempotente corrido (política global `TRANSITION_ISSUE` = ALWAYS_APPROVE). Servicios reiniciados y verificados: AP-14 muestra la acción en sus 70 ítems y el motivo en los vínculos (rellenado desde el payload).

- **Acción y motivo por ítem de aprobación**: columnas `ApprovalItem.action` (`CREATE | UPDATE | CANCEL`) y `ApprovalItem.rationale` (JSON `{ reason, evidence[], inconsistencies?[{ id, severity, description, evidence }] }`); migración `20261009185956_action_rationale`, que también rellena `action` de los ítems existentes según el tipo de operación y el motivo de los vínculos (desde su payload). Los constructores (`packages/core/src/engine/builders.ts`) completan el motivo: historia nueva → qué parte de la épica no cubren las historias existentes, con evidencia; tarea nueva → por qué hace falta; vínculo → motivo de la dependencia; actualización de HU (flujo B) → las inconsistencias concretas de la validación (severidad y evidencia) y la justificación de cada cambio. UI de la solicitud (`apps/web/app/approvals/[id]/page.tsx`): insignia *Crear/Modificar/Cancelar* y bloque *Por qué* con inconsistencias y evidencia.
- **Contratos de agentes** (`packages/shared/src/tasks.ts`): `storyProposal.rationale`, `taskProposal.rationale`, `functionalAnalysis.obsoleteItems` (historias existentes de la épica que sobran) y `storyReview.cancellation` (la HU sobra), con `cancellationSchema { reason: DUPLICATE | OUT_OF_SCOPE | OBSOLETE, explanation, duplicateOf?, evidence }`.
- **Cancelar una HU = transición real en Jira** (decisión del usuario: no queda solo como recomendación): operación `TRANSITION_ISSUE` ("Cancelar issues en Jira (transición de estado)"), `ALWAYS_APPROVE` por defecto y en el piso `HARD_FLOOR`. Ítem `cancel:<CLAVE>` en el grupo *Historias a cancelar*, con payload `{ issueKey, transitionId, transitionName, comment, reason, duplicateOf?, baseUpdated?, baseHash? }`; el comentario que queda en Jira lleva el motivo. En el flujo A solo se aceptan claves que de verdad son hijas de la épica.
- **Configuración del proyecto**: `jira.cancelTransition { id, name }`, elegida en *Configuración → Proyectos* → el proyecto → pestaña *Jira* → *Transición para cancelar historias* entre las transiciones descubiertas. *Descubrir tipos y campos* ahora lee también las transiciones de una historia de muestra del proyecto (`discovered.transitions`, `discovered.transitionsFrom`).
- **Publicación**: en modo real, sin transición mapeada el ítem se omite con el aviso "Falta mapear la transición de cancelación…"; antes de transicionar se verifica que la HU no haya cambiado (si cambió → *Revisión por conflicto*); las cancelaciones se ejecutan al final; la publicación recuerda las issues que ella misma modificó para no tomarlas como conflicto; la revisión por conflicto conserva el tipo de operación, la acción y el motivo.
- **MCP**: `jira_get_transitions` (lectura, `GetTransitions`) y `jira_transition_issue` (escritura, `TransitionIssue`) en el mapa de capacidades y en el proceso de escritura restringido. Verificado en el Jira de prueba: `SCRUM` **no tiene estado de cancelación** (transiciones: Idea, Por hacer, En curso, Testing y Listo).
- **Propuestas de capacidades con acción y evidencia**: columnas `CapabilityProposal.action` (`CREATE | UPDATE | CANCEL`, por defecto `CREATE`) y `CapabilityProposal.evidence` (`String[]`); contrato `capabilityGap.action` y `capabilityGap.evidence`. Plan para UPDATE (la capacidad existe): crear nueva versión + activar (+ asignar al proyecto de origen si la skill no estaba). Plan para CANCEL: quitar la skill de las skills del proyecto de origen (`MODIFY_AGENT_CONFIG`) + desactivarla en el catálogo (operación de activación del tipo). La verificación exige que la capacidad exista para UPDATE/CANCEL; el supervisor principal no se puede cancelar. UI: columna *Acción* en el listado de propuestas; en el detalle, insignia de acción y tarjeta *Qué propone y por qué* (problema, justificación, inconsistencias o brechas encontradas).
- **Pruebas** (89 en total, todas pasan): nuevo `packages/core/test/integration/actions.test.ts` (motivo en flujo B con inconsistencias, motivo en flujo A, cancelación por transición contra el Jira simulado en modo real con comentario y estado "Cancelada", y sin transición mapeada no se cancela) y 3 casos en `proposals.test.ts` (modificar, cancelar y no se puede modificar ni cancelar algo inexistente).
- **Pendiente**: la CLI (`pnpm mao approval`) todavía no muestra acción ni motivo; el modelo simulado no genera recomendaciones de cancelar por sí solo (solo el modelo real o las pruebas); para ejecutar cancelaciones en `SCRUM` hay que agregar un estado "Cancelada" al flujo de Jira (o mapear uno existente); CP-2 a CP-4 siguen necesitando *Regenerar diseño*.

## Consumo de tokens (2026-10-09) — Implementado

- **Registro por invocación** (`ModelInvocation`, migración `20261009182249_model_invocations`, aplicada en Railway con `migrate deploy` y relleno desde `ExecutionStep.decisions`): lo graba `AgentRuntime.run` para los tres orígenes (ejecuciones, planificación del supervisor, pruebas de catálogo), **también si la respuesta no cumple el contrato**. Un fallo al registrar solo deja un aviso: no corta la tarea.
- **Caché**: `claudeCodeUsage` lee `modelUsage` de Claude Code (suma por modelo, incluida caché escrita/leída); la API también informa caché. Verificado: en una llamada mínima `input_tokens` = 17 frente a 13.434 tokens de caché. Las filas rellenadas (EX-1 a EX-13) no tienen desglose de caché.
- **Vistas**: tarjeta *Consumo de tokens* en el detalle de la ejecución; pantalla *Configuración → Consumo de IA* (`/usage`); `GET /api/executions/:id/usage`, `GET /api/usage?days=&project=`; CLI `pnpm mao usage [EX] [--days N] [--project P]`. El costo se rotula siempre como *estimado (equivalente API)*.
- Pruebas: lectura del uso real de Claude Code, registro con respuesta fuera de contrato + reintento y agregados (78 en total).

## Propuestas de capacidades: diagnóstico (2026-10-09)

- **CP-1** `OracleSQLValidation` (EX-1, demo): válida, en `PENDING_APPROVAL` con la solicitud **AP-12** sin decidir. La pantalla de la propuesta no enlaza a su solicitud (solo aparece justo después de enviarla) → el usuario no encuentra cómo seguir.
- **CP-2/3/4** (EX-13, modelo real): definición vacía por la regresión de arriba (ya corregida); deduplicación por `targetKey` impide regenerarlas mientras sigan en DRAFT.
- **Ciclo actual** (manual, con aprobaciones obligatorias por piso de seguridad `HARD_FLOOR`): propuesta → enviar → aprobar (`APPLY_CAPABILITY_PROPOSAL`, crea la versión v1 en APPROVED) → solicitar activación en el catálogo → aprobar (`ACTIVATE_SKILL`) → asignar (`projectSkills` del proyecto sin aprobación, o nueva versión del agente + `ACTIVATE_AGENT`). El estado `APPLIED` nunca se asigna; `enabledSkills` de la configuración no se usa en ningún lado; la intención de asignación solo vive como texto en `solution`.
- **Decisión del usuario (2026-10-09)**: una sola confirmación sobre el plan completo y asignación al proyecto de origen.

## Propuestas: "confirmo y se configura sola" (2026-10-09) — Implementado

- **Plan de implementación** (`ProposalService.planFor`, calculado por el backend): para una skill, 1) crear la versión en el catálogo (`APPLY_CAPABILITY_PROPOSAL`), 2) activarla (`ACTIVATE_SKILL`), 3) agregarla a `projectSkills` del proyecto de la ejecución que detectó la necesidad (`MODIFY_AGENT_CONFIG`). Muestra qué agentes la reciben (por `appliesTo.tasks`) y avisa si no limita tareas. Para agentes/orquestadores: crear + activar. Para propuestas aprobadas con el flujo anterior (sin activar), el plan completa lo que falta.
- **Enviar a aprobación** crea una única solicitud con los pasos como ítems dependientes (rechazo en cascada). **Confirmar e implementar** (`POST /api/proposals/:id/implement` con el hash del plan) registra una decisión individual por paso (se respeta `ALWAYS_APPROVE` y el piso `HARD_FLOOR`: no se relajó ninguna política) y, al decidirse el último, `applyDecidedPlan` aplica todo en la misma transacción; la propuesta queda `APPLIED` (o `APPROVED` si se rechazó algún paso). Si había una solicitud del formato anterior (un solo paso, como AP-12 de CP-1), se reemplaza (`SUPERSEDED`).
- **Regenerar diseño** (`POST /api/proposals/:id/redesign`): CapabilityDesigner vuelve a diseñar la definición de un borrador a partir del problema y la solución, con el proveedor de la ejecución de origen (consumo registrado con origen `PROPOSAL_REDESIGN`). Solo se toma la definición: tipo, clave, herramientas y permisos no los cambia el modelo.
- **UI**: plan con estado de cada paso, enlace a la solicitud abierta, confirmación con el hash, "Regenerar diseño" cuando la verificación falla.
- **Pendiente para el usuario**: CP-1 (demo) lista para "Confirmar e implementar"; CP-2 a CP-4 (SCRUM) necesitan "Regenerar diseño" (consume tokens del modelo real) antes de implementarse.
- Pruebas: plan de 3 pasos, hash inválido no aplica nada, una decisión por paso, aprobación parcial, reemplazo de la solicitud anterior y regenerar diseño (82 en total). Se corrigieron dos dependencias de orden entre archivos de prueba (flujo A ↔ propuestas).

## Regresión corregida: objetos de forma libre en salidas estructuradas (2026-10-09)

El adaptador `toStructuredSchema` (agregado para EX-13) forzaba `additionalProperties: false` también en los `z.record`: la `definition` de las propuestas y el `input` del plan del supervisor solo podían valer `{}`. Por eso **CP-2, CP-3 y CP-4** (generadas por EX-13 con modelo real) quedaron con definición vacía y "Con errores". Ahora esos campos se piden como texto JSON (con la forma esperada en la descripción) y `reviveStructuredOutput` los vuelve objeto antes de validar el contrato. Verificado con una invocación real (haiku): la definición de skill llega, cumple el contrato y pasa `skillDefinitionSchema`. Pruebas: ningún objeto cerrado sin propiedades en los contratos y ida y vuelta de la definición. CP-2 a CP-4 siguen en DRAFT con definición vacía (hay que regenerarlas o completarlas).

## Navegación (2026-10-09) — Implementado

- **Arriba (operación de un usuario)**: Inicio, Backlog de Jira, Nueva ejecución, Ejecuciones, Aprobaciones.
- **Pie: grupo desplegable *Configuración***: Proyectos, Agentes, Orquestadores, Skills, Propuestas, Auditoría y *Ajustes generales* (la antigua página "Configuración": servicios, conexiones MCP, proveedores, parámetros, seguridad, exportar).
- Usa el ítem padre con hijos del `Sidebar` del design system (`fk-nav__item[aria-expanded]` + `fk-nav__children`, máximo dos niveles; el DS ubica Configuración en `footerItems`). Se abre solo si la página activa es un hijo, recuerda el estado (`localStorage` `mao-nav-config`), cerrado muestra la suma de contadores de los hijos (propuestas pendientes) y con el menú colapsado el clic expande el menú y abre el grupo; colapsado, el ícono se marca si la página activa pertenece al grupo. Un solo ítem activo (ruta más específica: `/executions/new` ya no marca también Ejecuciones). Migas de pan con "Configuración" en las pantallas del grupo. La barra lateral ahora scrollea (con el grupo abierto podía cortarse).
- El indicador de desarrollo de Next tapaba el botón del pie: `devIndicators.position = 'bottom-right'`.
- Criterio discutible: *Auditoría* quedó en Configuración (gobierno, no operación diaria).

## Arreglo: modelo real en Windows (2026-10-09)

La primera corrida con `claude-local` (`EX-13`, lanzada desde la UI sobre `SCRUM-5`) destapó dos bugs del runner local:

1. **`ENOENT`**: el archivo temporal del prompt de sistema llevaba el `correlationId` (`ejecución:etapa:intento`) y Windows no admite `:` en nombres de archivo. Corregido con `promptFileName` (`core/providers/local-claude.ts`).
2. **`INVALID_RESPONSE` (no cumple el contrato)**: el runner pasaba a `--json-schema` el esquema crudo de Zod (`$schema` draft 2020-12, `default`); verificado con Claude Code 2.1.128 que así **ignora la salida estructurada** (no hay `structured_output`, responde texto libre). El proveedor por API ya adaptaba el esquema; ahora ambos usan `toStructuredSchema` (`core/providers/structured-schema.ts`). Con el esquema adaptado, `structured_output` llega y cumple el contrato.

Pruebas unitarias para los dos casos (74 en total).

**Primera corrida con modelo real (EX-13, flujo A sobre `SCRUM-5`)**: todas las etapas completas en ~11 min, espera aprobación en `AP-14` (**70 operaciones**: 7 historias nuevas + tareas BE/FE/FS/QA + vínculos). Calidad muy superior al simulado: reconoce las 5 HU existentes (no duplica `SCRUM-8`), deriva historias de las reglas de negocio y requisitos no funcionales de la épica (reapertura, cierre automático a 10 días, roles de operadores, SLA de 48 h hábiles, reintentos con el CRM, WCAG 2.1 AA, Ley 25.326), 7 ambigüedades y 10 preguntas abiertas, QA `NEEDS_ATTENTION` con aclaraciones concretas, y el supervisor detecta una brecha de capacidad (skill de cumplimiento normativo). Costo informado por Claude Code: USD 2,88 (con sesión de claude.ai consume la cuota de la suscripción). Hallazgo: devolvió `qualityScore` 0,78 (escala 0-1) porque la adaptación del esquema quita `minimum`/`maximum`; se agregó la escala como `describe` en `score`, `qualityScore` y `confidence` (`shared/src/tasks.ts`) para próximas corridas (EX-13 conserva el 0,78). 70 operaciones en una sola aprobación es mucho para revisar: evaluar límites o agrupación por historia.

## Backlog de Jira (2026-10-09) — Implementado

Para elegir qué analizar sin escribir claves a mano: pantalla **Backlog de Jira** (`/backlog`, menú *Operación*; también *Ver backlog* en la ficha del proyecto) con pestañas *Épicas* (desplegables, con sus HU) e *Historias* (por defecto, solo sin épica), búsqueda por clave o texto e "Incluir terminadas". "Analizar épica" / "Validar HU" abren *Nueva ejecución* precargada (`?project=&orchestrator=&epicKey|storyKey=&from=backlog`). API `GET /api/projects/:key/backlog?kind=epic|story&parent=&withoutParent=&q=&includeDone=` (`BacklogService`, solo lectura, JQL armado con los tipos mapeados, texto saneado, máximo 50 por consulta: sin paginación todavía). CLI `pnpm mao backlog`. Skill de Claude Code actualizada. Pruebas: JQL (incluida inyección por texto) y endpoint sobre DEMO (72 en total). Verificado contra Jira real (`SCRUM`) por CLI y UI.

## Primera corrida sobre Jira real (2026-10-09)

- **Datos de prueba** en `SCRUM` (etiqueta `mao-prueba`; detalle en MCP_INTEGRATION.md): épica `SCRUM-5` (reclamos de clientes) con 5 HU de calidad variada a propósito; `SCRUM-6` bloquea a `SCRUM-9`. Creadas con el MCP fuera de la plataforma, a pedido del usuario (no pasan por `PublicationService`).
- **Configuración**: en `SCRUM`, "story" → `Historia` (antes `Feature`), configuración v5.
- **Corridas** (modelo simulado, Jira real solo lectura, aprobaciones **pendientes** para revisión humana): `EX-8` flujo A sobre `SCRUM-5` → `AP-9` (4 operaciones); flujo B `EX-9` (`SCRUM-7`, diagnóstico 24/100) → `AP-8`, `EX-10` (`SCRUM-8`, 40/100) → `AP-10`, `EX-11` (`SCRUM-10`, 36/100) → `AP-11`. Las tres HU quedan `NOT_READY` con problemas correctos (criterios no verificables, términos vagos, falta de formato "Como… quiero… para…").
- **Bug corregido**: los vínculos se habrían publicado **invertidos** en Jira real (`jira_create_issue_link` asigna "blocks" a `inward_issue_key`). Arreglo en `mcpLinkArgs` + reconciliación con dirección + prueba unitaria con el formato real (66 pruebas).
- **Verificado**: `parent` épica → historia funciona con `jira_create_issue`; el contexto lee vínculos de las hijas.
- **Hallazgos del modelo simulado** (no afectan al modelo real, pero invalidan el contenido de la validación): (1) `storyImprovements` (`core/providers/mock/story.ts`) propone descripción, flujos alternativos, validaciones y criterios **fijos del demo de turnos** (sucursal, horario) para cualquier HU; (2) `sameCapability` exige la misma primera palabra, por eso no ve que `SCRUM-8` cubre "Carga de documentación adjunta" y el flujo A propone una historia duplicada sin advertencia de QA; (3) toda regla de negocio de la épica se marca como faltante en cada HU aunque no aplique; (4) `SCRUM-10` no se marca como demasiado amplia y no se detecta la brecha de Oracle 19c (el detector mira la configuración del proyecto, no el texto de la HU).
- **Otros**: el objetivo que arma el supervisor elimina la clave y deja doble espacio ("Validá y mejorá la HU  y proponé…") y ese texto termina en la descripción propuesta; el 100/100 del supervisor mide el plan propuesto, no la HU original (puede confundir).
- **Modelo real**: `claude auth status` → sesión iniciada; `pnpm mao doctor --mcp` → `claude-local` **AVAILABLE**. Próximo paso: repetir las corridas con `claude-local` (consume la cuota de la cuenta de Claude con sesión iniciada).

## Para quien continúa (leer primero)

| Necesitás… | Dónde está |
| --- | --- |
| Qué se hizo, qué se verificó, qué falta | Este archivo (secciones siguientes) |
| Instalar, ejecutar, probar los dos flujos, activar Jira real | [README.md](README.md) → *Instalación*, *Ejecución*, *Probar los dos flujos*, *Activar la integración real con Jira* |
| Reglas para desarrollar con Claude Code | [CLAUDE.md](CLAUDE.md) |
| Arquitectura y decisiones técnicas | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Modelo de datos | [DATA_MODEL.md](DATA_MODEL.md) |
| Agentes, skills, proveedores de IA | [AGENTS.md](AGENTS.md) |
| Orquestadores A y B | [WORKFLOWS.md](WORKFLOWS.md) |
| MCP Jira: hallazgos, formato real, cómo habilitar escrituras | [MCP_INTEGRATION.md](MCP_INTEGRATION.md) |
| Políticas y aprobaciones | [APPROVAL_POLICIES.md](APPROVAL_POLICIES.md) |
| Próximos pasos | [ROADMAP.md](ROADMAP.md) |
| Design system (Flock IT) | [design-system/README.md](design-system/README.md) |

Resumen en tres líneas: el MVP funciona de punta a punta con un **modelo simulado** (heurísticas determinísticas, siempre marcado como simulación) y datos demo; la **lectura de Jira real** está verificada contra el sitio de prueba (proyecto `SCRUM`); faltan **credenciales de modelo real** y un **entorno de Jira autorizado** para habilitar escrituras (hoy bloqueadas a propósito).

Prueba rápida de los dos flujos (con los servicios arriba):

- UI http://127.0.0.1:3000 → *Nueva ejecución* → proyecto `DEMO` → épica `DEMO-100` (flujo A) o historia `DEMO-102` (flujo B) → aprobar en *Aprobaciones*.
- Terminal o Claude Code: `pnpm mao ask "Analizá la épica DEMO-100 y proponé historias y tareas técnicas." --wait`, luego `pnpm mao approval 1` y `pnpm mao approve 1 --batch --confirm <hash>`.

Para activar lo real:

1. Modelo: `claude auth login` (runner local) o `ANTHROPIC_API_KEY` en `.env`; elegir el proveedor en *Configuración → Ajustes generales → Proveedores de IA*. El proveedor por API trae activado por defecto el *fallback* del lado del servidor ante rechazos del modelo (se puede quitar en `packages/core/src/providers/anthropic-api.ts`).
2. Jira corporativo: cambiar `JIRA_URL/USERNAME/API_TOKEN` en `MCP/mcp-atlassian/.env`, crear el proyecto en modo *Jira real* con la conexión `jira-mcp`, *Descubrir tipos y campos* y mapear los tipos.
3. Escrituras: solo en un Jira de prueba autorizado → `MAO_ALLOW_JIRA_WRITES=true`, reiniciar API y worker, habilitar la escritura en *Configuración → Ajustes generales → Conexiones MCP* (pide escribir `HABILITAR ESCRITURA`) y verificar parent de subtareas y dirección de vínculos (ver MCP_INTEGRATION.md).

## Base de datos en Railway (2026-10-09)

- **Base de trabajo**: PostgreSQL 18.6 en Railway, base `railway`, schema `public`, vía el proxy público de Railway (`*.proxy.rlwy.net`; host y puerto exactos solo en `.env`, el repo es público). La URL completa (con contraseña) está **solo en `.env`** (ignorado por git), con `sslmode=require&connect_timeout=15`. La URL local quedó comentada en `.env` para volver atrás.
- **Pruebas**: siguen en `mao_test` del PostgreSQL embebido local (`pnpm db:start`); `global-setup` rechaza una base de pruebas remota salvo `MAO_ALLOW_REMOTE_TEST_DB=1`.
- **Datos**: se aplicó la migración `init` y se copiaron los 760 registros de la base local con `scripts/db-copy.mjs` (proyectos `DEMO` y `SCRUM` con su configuración descubierta, ejecuciones EX-1…6, aprobaciones, auditoría, propuesta CP-1). Verificado fila por fila; secuencias ajustadas (la siguiente ejecución fue EX-7). La base local `mao` quedó intacta como respaldo, pero ya no se actualiza.
- **Cambios de código**: timeouts de transacción interactiva en `packages/db/src/index.ts` (60 s / 10 s, configurables con `MAO_DB_TX_TIMEOUT_MS` y `MAO_DB_TX_MAX_WAIT_MS`; con los 5 s por defecto la aprobación en lote fallaría por latencia); `describeDatabaseUrl` en `@mao/shared`; `/api/status` informa `dbTarget` (host, puerto, base, remota, TLS; nunca credenciales) y la UI lo muestra en *Configuración → Ajustes generales → Estado de servicios*; `pnpm doctor` diagnostica la base de trabajo y la de pruebas por separado; `db-embedded.mjs start-if-local` (lo usa `start.ps1`).
- **Rendimiento** (≈155 ms por consulta desde esta PC): flujo A sobre `DEMO-100` ≈ 45 s hasta la aprobación; aprobación en lote de 29 ítems ≈ 17 s; publicación simulada ≈ 37 s.
- **Pendiente**: respaldos (según el plan de Railway, o `pg_dump` programado) y **rotar la contraseña** del servicio en Railway (se compartió por chat) y actualizar `.env`. Railway usa colación `en_US.UTF-8` (el embebido, `C`).
- **Ojo con migraciones**: no correr `pnpm db:migrate:dev` contra Railway (ver CLAUDE.md).

## Cómo retomar en otra PC

1. Copiá la carpeta (o clonala si la subiste a un remoto: el repo git está inicializado **sin commits**; no incluye `.env`, `MCP/` ni `.data/`).
2. Copiá aparte, si corresponde, `MCP/mcp-atlassian` con su `.env` (repo independiente con secretos).
3. Para compartir la base de Railway: copiá `.env.example` a `.env` y poné en `DATABASE_URL` la URL de Railway (ver README → *Base de datos en Railway*) **antes** del paso siguiente. Los datos ya están en Railway: no hace falta copiarlos.
4. `powershell -ExecutionPolicy Bypass -File scripts\setup.ps1` (genera el token si falta, Postgres embebido para las pruebas, migraciones y seed idempotente sobre `DATABASE_URL`).
5. `powershell -ExecutionPolicy Bypass -File scripts\start.ps1` → http://127.0.0.1:3000 (con base remota no inicia el Postgres embebido).
6. `pnpm db:start` y `pnpm test` para confirmar el entorno.

## Verificado (2026-10-09)

- `pnpm test`: **63 pruebas** (32 unitarias, 31 de integración en base `mao_test` recreada) — CRUD/versionado de agentes y skills, validación de orquestadores (ciclos, dependencias), flujos A y B, transiciones, políticas (piso, obligatorias, herencia), rechazo de escrituras no aprobadas/alteradas/no habilitadas, reintentos con backoff, idempotencia + reconciliación tras timeout, conflicto de versión con nueva revisión, errores MCP, recuperación tras caída de worker, cancelación, propuestas, consistencia CLI ↔ API ↔ UI, seguridad HTTP (token, Host, Origin).
- `pnpm typecheck` (7 paquetes) y `pnpm --filter @mao/web build` (20 rutas) sin errores.
- `scripts\setup.ps1`, `start.ps1 -Background`, `stop.ps1` ejecutados en esta PC.
- `pnpm mao doctor --mcp`: MCP Jira CONNECTED (63 herramientas), proveedores con estado real.
- Desde Claude Code: `pnpm mao ask "Analizá la épica DEMO-100…" --wait` → plan del supervisor → EX en espera → aprobación por CLI con `--confirm` → publicación simulada. Origen registrado `CLAUDE_CODE`.
- Desde la UI: flujo B sobre `DEMO-102`, aprobación individual + lote, la ejecución aparece igual en la CLI (origen `UI`).
- Jira real (`SCRUM`, sitio de prueba): descubrimiento (7 tipos, 56 campos, 4 vínculos), lectura de `SCRUM-1`, flujo B completo; publicación **bloqueada** (0 escrituras) por no estar habilitada.
- Con la base en Railway: `pnpm test` **65 pruebas** (2 nuevas de `describeDatabaseUrl`), `pnpm typecheck`, `pnpm mao doctor` (trabajo: Railway con TLS; pruebas: local), servicios reiniciados con `start.ps1 -Background`, flujo A `EX-7` desde Claude Code → aprobación en lote `AP-7` (29 ítems) por CLI → publicación simulada `COMPLETED`; la UI muestra "PostgreSQL remoto con TLS".
- Con acción y motivo y la cancelación por transición: `pnpm test` **89 pruebas**, todas pasan (incluida la cancelación contra el Jira simulado en modo real). Transiciones de `SCRUM` leídas con el MCP: no hay estado de cancelación.

## Bugs encontrados y corregidos durante la verificación

- Comparación de fechas en SQL crudo contra la zona local de PostgreSQL (reintentos y leases demoraban 3 h) → `now() AT TIME ZONE 'UTC'`.
- Conexiones MCP concurrentes (descubrimiento en paralelo) → conexión única con promesa compartida.
- `jira_get_project_fields` devuelve `[]` en Jira Cloud → se usa `jira_search_fields`.
- Escaneo de seguridad no detectaba "Ignorá" con tilde.
- Edición de archivos UTF-8 con PowerShell 5.1 corrompía acentos (reparado; ver CLAUDE.md).
- Con la base remota, las transacciones interactivas superaban el timeout por defecto de Prisma (5 s) → timeouts configurables (60 s).

## Pendiente / bloqueado

- **Pendiente (antes bloqueado)**: modelo real. Desde 2026-10-09 `claude auth status` → sesión iniciada y `claude-local` diagnostica AVAILABLE; falta la primera corrida con él (elegirlo en *Configuración → Ajustes generales → Proveedores* o por proyecto). `ANTHROPIC_API_KEY` sigue vacío.
- **Bloqueado (autorización)**: escrituras reales en Jira. Implementadas y probadas contra un Jira simulado; requieren un entorno de prueba autorizado, `MAO_ALLOW_JIRA_WRITES=true` y habilitar la conexión. Verificar parent y dirección de vínculos (ver MCP_INTEGRATION.md).
- **Pendiente**: `MAART-1052` del enunciado no existe en el Jira conectado (solo hay `SCRUM`); conectar el Jira corporativo cambiando el `.env` del MCP.
- **Pendiente**: mapeo de campos personalizados en la publicación (story points, sprint); editor visual drag-and-drop; usuarios/roles; pruebas E2E de UI con Playwright. Ver ROADMAP.md.
- **Pendiente**: la CLI (`pnpm mao approval`) no muestra la acción (Crear/Modificar/Cancelar) ni el motivo de cada ítem; hoy solo la UI.
- **Pendiente**: el modelo simulado no propone cancelar historias por sí solo (solo el modelo real o las pruebas).
- **Pendiente (Jira)**: `SCRUM` no tiene estado de cancelación (Idea, Por hacer, En curso, Testing, Listo). Para ejecutar cancelaciones hay que agregar un estado "Cancelada" al flujo de Jira o mapear uno existente en *Transición para cancelar historias*.
- **Pendiente para el usuario**: CP-2 a CP-4 necesitan *Regenerar diseño* antes de implementarse.
- **Parcial**: `claude doctor` no se puede automatizar (TUI interactiva); el diagnóstico propio cubre Node, pnpm, Docker, PostgreSQL, Claude Code, MCP y proveedores.

## Hallazgos del entorno (Fase 0)

- Windows 11 Pro, PowerShell 5.1, Node 24.15.0, npm 11.12.1, git 2.54, winget 1.29. pnpm 10.18.3 instalado a nivel usuario.
- Docker y WSL no instalados → PostgreSQL embebido (`embedded-postgres`, PostgreSQL 18.4) en `127.0.0.1:5433`; datos en `.data/postgres`. `docker-compose.yml` listo.
- Claude Code 2.1.128 (winget): soporta `-p`, `--output-format json|stream-json`, `--json-schema`, `--session-id`, `--tools ""`, `--strict-mcp-config`, `--system-prompt-file`, `--max-budget-usd`, `--effort`. CLI sin sesión.
- MCP Jira: `MCP/mcp-atlassian` (FastMCP 3.4.4), stdio, 63 tools, 0 resources/prompts; `.env` con `JIRA_URL/USERNAME/API_TOKEN` (no inspeccionados). No se modificó ninguna configuración MCP existente.

## Design system

`design-system/` contiene **Flock IT** (copiado del artifact https://claude.ai/artifact/8tXDvvuVmKmR4tM2yejy6a): `README.md` (guía de marca), `tokens.json` (fuente de verdad), `componentes.md`, `components/bundle.css` (clases `fk-*`), fuentes `components/src/*.jsx`, guías por componente, previews de referencia y logo. `design-system/scripts/build-tokens.mjs` genera `apps/web/styles/tokens.css` y `flock-ui.css` (se ejecuta solo en `dev`/`build`). La UI porta los componentes a TSX en `apps/web/components/ui`.

## Datos útiles

- Proyecto demo `DEMO`: épica `DEMO-100`, HU `DEMO-101/102/103` (103 contiene un intento de inyección para la demo), subtareas `DEMO-110/111/112`.
- Token del propietario: `MAO_OWNER_TOKEN` en `.env` (lo usan la CLI y el proxy de la UI; el navegador nunca lo recibe).
- Scripts de verificación real: `scripts/verify-jira-read.mjs`, `scripts/verify-live-flow.mjs`.
- Prueba de humo del motor sin servicios: `node --import tsx packages/core/scripts/smoke.ts EPIC|STORY`.
