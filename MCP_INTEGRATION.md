# Integración MCP con Jira

## Hallazgos (Fase 0, 2026-10-09)

- Servidor: `MCP/mcp-atlassian` (sooperset/mcp-atlassian, FastMCP 3.4.4, Python 3.14 en `.venv`), commit `ec54351`.
- Transporte: **stdio**. En Claude Code estaba registrado solo para otra carpeta (`Documents/mcp-atlassian`) como `uv run --project … mcp-atlassian --env-file …\.env`. No se modificó esa configuración.
- Credenciales: `MCP/mcp-atlassian/.env` define `JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`. La plataforma **no lee** ese archivo: lo pasa con `--env-file` al proceso del servidor.
- Herramientas: 63 (Jira), 0 recursos, 0 prompts. Con `READ_ONLY_MODE=true` quedan 38 (sin escrituras).
- Sitio: Jira Cloud de prueba con un proyecto `SCRUM` (tipos: Epic, Subtask, Feature, Tarea, Historia, Error; 56 campos; vínculos Blocks, Cloners, Duplicate, Relates). `MAART-1052` (del enunciado) **no existe** en ese sitio. Hay **dos tipos llamados `Tarea`** (ids 10004 y 10008): al habilitar escrituras, crear por nombre puede caer en cualquiera de los dos; conviene renombrar uno en Jira o mapear por id.
- Datos de prueba (2026-10-09, etiqueta `mao-prueba`, creados a pedido del usuario fuera de la plataforma): épica `SCRUM-5` "Autogestión de reclamos de clientes en el portal web" con las historias `SCRUM-6` (bien formada), `SCRUM-7` (criterios vagos), `SCRUM-8` (sin criterios ni formato de HU), `SCRUM-9` (dependencias; `SCRUM-6` la bloquea) y `SCRUM-10` (demasiado amplia, menciona un sistema legado en Oracle 19c). En la plataforma, el tipo "story" de `SCRUM` pasó de `Feature` a `Historia` (configuración v5).
- Transiciones (2026-10-09, leídas con `jira_get_transitions`): el flujo de `SCRUM` ofrece **Idea, Por hacer, En curso, Testing y Listo**; **no hay estado de cancelación**. Para que la plataforma pueda cancelar historias en ese proyecto hay que agregar un estado "Cancelada" al flujo de Jira (o elegir uno existente como transición de cancelación, si se acepta esa semántica). Mientras tanto, la publicación real omite los ítems de cancelación con un aviso.

## Formato verificado

- `jira_get_issue` → JSON simplificado (`key`, `summary`, `status.name`, `issue_type.name`, `project.key`, `created`, `updated` como texto local, `description` si existe, `parent`/`subtasks`/`issuelinks` si existen).
- `jira_search` → `{ total, start_at, max_results, issues: [...] }`. JQL sin restricción es rechazado por Jira Cloud.
- `jira_get_project_fields` puede devolver `[]`; se usa `jira_search_fields` (catálogo global).
- `jira_get_transitions(issue_key)` → lista de transiciones disponibles para esa issue (`id`, `name`). *Descubrir tipos y campos* la llama sobre una historia de muestra del proyecto y guarda el resultado en `discovered.transitions` (y la clave usada en `discovered.transitionsFrom`).

## Cómo lo usa la plataforma

- `McpStdioClient` (SDK oficial `@modelcontextprotocol/sdk`): conexión única por proceso aunque haya llamadas concurrentes; adapta argumentos según el esquema de cada tool; clasifica errores (`NOT_FOUND`, `AUTH_ERROR`, `AUTHORIZATION_ERROR`, `JIRA_ERROR`, `TIMEOUT`, `MCP_DISCONNECTED`).
- `McpJiraGateway`:
  - **Lecturas** en un proceso con `READ_ONLY_MODE=true` (el servidor rechaza escrituras).
  - **Escrituras** en otro proceso con `ENABLED_TOOLS` mínimo (`WRITE_CLIENT_TOOLS`: crear, actualizar, vincular, transicionar y leer para reconciliar). Solo lo usa `PublicationService`.
- Mapa de capacidades (operación de dominio → tool real): `GetProject`, `GetIssue`, `SearchIssues`, `GetIssueTypes`, `GetFields`, `GetIssueLinks`, `GetLinkTypes`, `GetTransitions` (`jira_get_transitions`, lectura), `CreateIssue`, `UpdateIssue`, `CreateIssueLink`, `LinkToEpic`, `TransitionIssue` (`jira_transition_issue`, escritura). Lo no disponible queda "No soportada".
- **Cancelar una HU** (implementado 2026-10-09): `jira_transition_issue(issue_key, transition_id, comment)` con la transición mapeada en `jira.cancelTransition` del proyecto y un comentario con el motivo. Solo lo invoca `PublicationService` para ítems `TRANSITION_ISSUE` aprobados (siempre aprobación individual), después de verificar que la HU no haya cambiado. Los agentes nunca reciben esta herramienta. `jira_delete_issue`, `jira_move_issue`, `jira_remove_issue_link`, `jira_remove_watcher` y `jira_edit_comment` nunca se invocan.

## Verificación

```powershell
pnpm mao doctor --mcp                          # diagnóstico en vivo (CONNECTED, 63 herramientas)
node scripts/verify-jira-read.mjs SCRUM SCRUM-1
node scripts/verify-live-flow.mjs SCRUM SCRUM-1 Feature Tarea Subtask   # flujo B real, publicación bloqueada
```

Resultado del 2026-10-09: lectura real OK; flujo B completo sobre `SCRUM-1`; 4 escrituras **bloqueadas** y 0 ejecutadas.

## Para habilitar escrituras (pendiente de un entorno autorizado)

1. `MAO_ALLOW_JIRA_WRITES=true` en `.env` y reiniciar API y worker.
2. Habilitar escritura en la conexión (requiere escribir `HABILITAR ESCRITURA`).
3. Verificar en el entorno de prueba:
   - `jira_create_issue` con `additional_fields.parent` para subtareas y para historias bajo épica (según el tipo de proyecto). **Verificado 2026-10-09** para historias bajo épica en `SCRUM` (tipo `Historia` con `parent` = épica); falta verificar subtareas.
   - Semántica de `jira_create_issue_link(link_type, inward_issue_key, outward_issue_key)`: **verificado 2026-10-09** contra Jira Cloud que la issue enviada como `inward_issue_key` es la que "blocks" (recibe la descripción saliente). En el dominio, `outwardKey` es la bloqueante e `inwardKey` la bloqueada; `mcpLinkArgs` (en `core/jira/mcp-gateway.ts`) cruza los roles al llamar al MCP. Antes de ese arreglo la plataforma habría publicado todos los vínculos invertidos. La reconciliación ahora exige además la dirección (`inward` en la issue bloqueada).
   - Etiqueta de correlación `mao-xxxxxxxx` (usada para reconciliar creaciones inciertas): desactivable por proyecto.
   - `jira_transition_issue` con comentario: probado solo contra el Jira simulado (estado "Cancelada"). En `SCRUM` falta un estado de cancelación (ver *Hallazgos*); una vez creado, volver a *Descubrir tipos y campos* y mapear la transición.
4. Las pruebas automáticas nunca escriben en Jira real (usan un Jira simulado en modo LIVE).
