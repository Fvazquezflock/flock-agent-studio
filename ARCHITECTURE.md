# Arquitectura

## Vista general

```
 Claude Code ──skill mao-platform──┐
 Terminal ──────── CLI `mao` ──────┤  HTTP + token (canal CLI / CLAUDE_CODE)
 Navegador ── Next.js (proxy) ─────┘  HTTP + token server-side (canal UI)
                                   ▼
                         API Fastify (127.0.0.1:4317)
                                   │  usa
                                   ▼
   ┌──────────────────────────── @mao/core ─────────────────────────────┐
   │ Supervisor · Catálogo versionado · Config (global→proyecto→op)     │
   │ Motor de ejecución (crea ejecuciones) · Aprobaciones · Políticas   │
   │ Propuestas · Auditoría · Conexiones MCP · Proveedores · Exportación│
   │ Archivos de catalog/ ↔ base (lo importado espera aprobación)       │
   └──────────────────────────────┬──────────────────────────────────────┘
                                  │ PostgreSQL (estado, eventos, auditoría)
                                  ▼
                          Worker (claim + leases)
                                  │ ejecuta etapas con
          ┌───────────────────────┼─────────────────────────────┐
          ▼                       ▼                             ▼
   AgentRuntime            IJiraGateway                 PublicationService
   (prompts + skills,      Demo | MCP (stdio,           (único camino a escrituras:
    IModelProvider)        READ_ONLY_MODE)               aprobación+política+flag)
```

## Separación de responsabilidades

| Capa | Dónde | Responsabilidad |
| --- | --- | --- |
| Interfaz de usuario | `apps/web` | Pantallas; nunca recibe el token (proxy server-side con anti-CSRF) |
| API de aplicación | `apps/api` | Validación (Zod), seguridad local, SSE, errores tipados |
| Motor de orquestación | `core/engine` | DAG declarativo, capas paralelas, transiciones, reintentos, recuperación |
| Agente supervisor | `core/supervisor`, handler `supervisor.review` | Plan desde lenguaje natural, calidad, conflictos, capacidades faltantes |
| Agentes y subagentes | `core/agents/runtime.ts` | Composición de prompt + skills aplicables, invocación, validación de salida |
| Catálogo de skills | `core/catalog` | Versionado, validación, carga selectiva por tarea |
| Catálogo y configuración en archivos | `core/catalog/file-format.ts`, `file-store.ts`, `sync-service.ts`; `core/config/config-format.ts`, `config-files.ts` | Formato y hash normalizado de `catalog/`, exportación base → archivos, importación de definiciones como pendientes de aprobación, aplicación explícita de la configuración |
| Motor de ejecución | `core/engine/engine.ts` + `apps/worker` | Persistencia de estados, leases, heartbeats, cancelación |
| Motor de aprobaciones | `core/approvals` + `core/policies` | Snapshots, revisiones, decisiones, piso de seguridad |
| Adaptadores de modelos | `core/providers` | `MockModelProvider`, `LocalClaudeRunner`, `AnthropicApiProvider` |
| Adaptadores MCP | `core/mcp`, `core/jira` | Cliente stdio oficial, mapa de capacidades, gateway Jira |
| Persistencia | `packages/db` | Prisma + migraciones versionadas |
| Auditoría/observabilidad | `core/audit`, `ExecutionEvent` | Registro inmutable sanitizado; eventos para SSE |

## Decisiones técnicas (y por qué)

- **Monorepo pnpm, TypeScript ESM ejecutado con `tsx`** en API/worker/CLI: sin paso de build para el MVP; `tsc --noEmit` valida tipos. Next.js compila la UI.
- **PostgreSQL embebido** (`embedded-postgres`, binarios oficiales) porque Docker/WSL no estaban instalados. `docker-compose.yml` queda listo con el mismo puerto/credenciales.
- **Base de trabajo en Railway** (opcional, en uso desde 2026-10-09): solo cambia `DATABASE_URL` (TLS con `sslmode=require`); el código no distingue local de remoto. Las pruebas de integración siguen en `mao_test` local y se niegan a correr contra una base remota salvo `MAO_ALLOW_REMOTE_TEST_DB=1`. Por la latencia (~150 ms por consulta) el cliente Prisma compartido fija timeouts de transacción interactiva de 60 s (espera 10 s) en lugar de 5 s/2 s: `decide` de aprobaciones actualiza ítem por ítem dentro de la transacción. Railway usa colación `en_US.UTF-8` y el embebido `C`: los `ORDER BY` sobre texto pueden diferir.
- **Worker con `FOR UPDATE SKIP LOCKED`** sobre la tabla `Execution` (sin Redis): leases de 60 s renovados cada 10 s; si un worker muere, el lease vence y otro retoma (las etapas `RUNNING` vuelven a la cola o fallan si agotaron intentos).
- **Archivos como fuente de verdad versionada, base como copia** (2026-10-09): definiciones y configuración sin secretos viven en `catalog/` (revisión con git, historial y portabilidad entre clones); la base conserva cada versión porque las ejecuciones fijan versiones y la auditoría, el diff y *Restaurar* trabajan sobre ellas. La dirección archivo → base nunca activa ni aplica sola: pasa por las mismas aprobaciones y validaciones que la UI. Ver *Catálogo y configuración en archivos*.
- **Handlers de etapa en código, flujos en datos**: el vocabulario ejecutable (`jira.context`, `agent.task`, `approval.gate`, `jira.publish`, `supervisor.review`) es fijo y auditable; los orquestadores son definiciones declarativas versionadas que los combinan (YAML en `catalog/orchestrators/`, JSON en la base). Preparado para un editor visual.
- **Contexto Jira determinístico**: los agentes no reciben herramientas; los servicios leen Jira (solo lectura) y les pasan datos delimitados como no confiables.
- **SSE por sondeo de `ExecutionEvent`** (700 ms) con `Last-Event-ID`: simple, robusto y recuperable; sin estado en memoria.
- **Proxy en Next** en lugar de CORS: el token del propietario vive solo en servidores; mutaciones con encabezado anti-CSRF, `Sec-Fetch-Site` y control de `Origin`; ambos servidores validan `Host` (DNS rebinding).
- **Fechas**: Prisma guarda UTC sin zona; la SQL cruda compara contra `now() AT TIME ZONE 'UTC'` (bug encontrado por las pruebas).

## Catálogo y configuración en archivos (`catalog/`) — Implementado

Carpeta `catalog/` en la raíz del repo (`MAO_CATALOG_DIR` la cambia, relativa a la raíz; `CoreDeps.catalogDir`). Estructura y comandos en README.md → *Catálogo y configuración en archivos*.

**Formato** (`core/catalog/file-format.ts`, `core/config/config-format.ts`):

- `agents/<Clave>.md` y `skills/<Clave>/SKILL.md`: frontmatter YAML con toda la definición salvo el texto largo, que va en el cuerpo (`systemPrompt` del agente, `instructions` de la skill). `orchestrators/<CLAVE>.yaml`: la definición completa. El nombre del archivo es la clave (`CATALOG_KEY_RE`: empieza con letra; letras, números, `_` o `-`; 2 a 64 caracteres). Cada archivo lleva un encabezado comentado con la regla de aprobación.
- Render sin pérdida: `parseCatalogFile(renderCatalogFile(def))` da el mismo hash que `def`; solo se omiten valores vacíos cuando quitarlos no cambia la definición normalizada.
- **Hash normalizado**: esquema Zod con valores por defecto, LF, sin BOM, cuerpo sin espacios en los extremos (`definitionHash`); en la configuración, además, orden estable (`configHash`: políticas por ámbito, proyecto, orquestador y operación; conexiones y proveedores por clave). Formato, comentarios y orden de claves no cuentan como cambios. Los archivos de configuración rechazan claves desconocidas (un error de tipeo no se ignora en silencio).
- `CatalogFileStore` (`core.catalogFiles`, `file-store.ts`): escritura atómica (temporal + rename), solo si cambia el texto; rechaza rutas fuera de la carpeta.

**Definiciones** (`CatalogSyncService`, `core.catalogSync`, `sync-service.ts`). Estado de cada archivo frente a la base:

| Estado | Significado |
| --- | --- |
| `IN_SYNC` | El archivo es la versión activa |
| `MISSING_FILE` | Hay versión activa y no hay archivo (se escribe al exportar) |
| `STALE_FILE` | Coincide con una versión `INACTIVE`, `ARCHIVED` o `REJECTED`: se reescribe desde la activa (o se borra si no hay activa) |
| `PENDING_APPROVAL` | El contenido ya está en la base como `DRAFT`, `PENDING_APPROVAL` o `APPROVED` (informa la solicitud abierta) |
| `CHANGED` | Contenido nuevo de una entidad existente: la sincronización lo importa |
| `NEW` | Archivo sin entidad en la base: la sincronización crea la entidad con v1 pendiente |
| `INVALID` | No se puede leer o no valida (esquema o referencias): nunca se importa |
| `INACTIVE` | Entidad sin versión activa y sin archivo |

Resultados de una acción: `EXPORTED`, `REMOVED`, `IMPORTED`. Modos: `status` (no escribe), `export` (la base manda para lo que conoce: escribe `MISSING_FILE`/`STALE_FILE`; no importa ni pisa `CHANGED`/`NEW`) y `sync` (export + importa `CHANGED`/`NEW`). `overwrite` (solo `export`, para migraciones) reemplaza también `CHANGED` e `INVALID` de entidades existentes por la versión activa (o los borra si no hay activa); nunca borra un archivo `NEW`. Orden skill → agente → orquestador, para que lo importado exista al validar las referencias de lo siguiente.

- **Importar** (`importFile`): valida con el catálogo (esquema, referencias, DAG), crea la versión nueva (o la entidad con v1) con la nota "Importado desde catalog/<ruta>" y pide su activación (`requestActivation`: queda `PENDING_APPROVAL` con su solicitud `AP-n`, sujeta a la política `ACTIVATE_*`). Si la política impide crear la solicitud (`DENIED`), la versión vuelve a su estado anterior y el reporte lo avisa. Nunca activa directo. Auditoría `CATALOG_FILE_IMPORTED`.
- `sync` se niega en una base sin catálogo instalado (`VALIDATION_ERROR`: hay que correr `pnpm db:seed`): importar ahí dejaría todo pendiente y el seed ya no haría la instalación inicial.
- **Base → archivos**: `ApprovalService` llama a `exportFilesAfter` después de confirmar la transacción (decidir, reemplazar o regenerar) en solicitudes `activation` y `capability_proposal`, y exporta catálogo y configuración; `CatalogService.deactivate` exporta (el archivo queda `STALE_FILE` y se borra). Así, rechazar una versión importada devuelve el archivo a la activa (o lo borra si no hay activa). `exportAfterChange` nunca lanza: un error de disco no deshace una decisión confirmada; queda en la consola y en la auditoría (`CATALOG_FILE_EXPORT_FAILED`).

**Configuración** (`ConfigFileService`, `core.configFiles`, `config-files.ts`): `global.yaml`, `policies.yaml`, `connections.yaml`, `providers.yaml` y `projects/<CLAVE>.yaml`. Estados `IN_SYNC`, `MISSING_FILE`, `STALE_FILE` (un contenido que la plataforma ya exportó o aplicó antes), `CHANGED` (contenido que la plataforma no escribió, con diff base → archivo) e `INVALID`; resultados `EXPORTED` y `APPLIED`.

- **Registro de hashes** en `GlobalSetting` clave `catalog.files`: por ruta relativa, el hash actual y los anteriores (hasta 50). Es por base, no por carpeta: si varios clones comparten la base, lo que exportó cualquiera cuenta como conocido. Distingue un archivo viejo (`STALE_FILE`, se reescribe) de una edición manual (`CHANGED`, no se pisa). `status()` no escribe archivos, pero registra el hash de los que están al día.
- **Exporta en cada cambio**, después de confirmar: `ConfigService.setGlobal`, `saveProjectConfig`, `createProject`, `updateProject`; `PolicyService.upsert`; `ConnectionService.create`/`update`; `ProviderService.create`/`update`; propuestas aplicadas (hook de aprobaciones). Durante `apply` y la carga inicial se suspende y se exporta una vez al final. Nunca lanza (`CONFIG_FILE_EXPORT_FAILED`).
- **`apply`** (acción explícita del propietario; sin rutas, todos los `CHANGED`), con las mismas validaciones que la UI: global → `setGlobal`; políticas → valida todo el archivo (piso de seguridad, obligatorias, proyecto existente y no DEMO) y, si algo falla, no aplica ninguna; registra una versión por política distinta y no borra las activas que faltan en el archivo; conexiones → crea (solo `MCP_STDIO` para `JIRA`, `normalizeEnvFile`) o cambia nombre y archivo de credenciales; nunca habilita la escritura, no borra ni cambia tipo o propósito; proveedores → crea o actualiza (la configuración del archivo reemplaza la de la base) con el filtro de secretos (`secretConfigKeys`: claves con forma de credencial salvo `apiKeyEnv` y `maxTokens`; `apiKeyEnv` tiene que ser un nombre de variable); el simulado no se administra desde archivos; proyectos → crea (`createProject`) o actualiza metadatos (`updateProject`) y guarda una versión nueva de la configuración si difiere (`checkJiraFields`: no inventar campos). Después reescribe en forma canónica lo aplicado. Auditoría `CONFIG_FILE_APPLIED`.
- **No va a los archivos**: `writeEnabled`, estado, capacidades y comando de las conexiones (el comando se resuelve en cada máquina con `MAO_JIRA_MCP_COMMAND`); el proveedor simulado; proyectos DEMO y sus políticas; secretos.

**Carga inicial y arranque**:

- `seedDatabase` (`core/seed/seed.ts`): primero `configFiles.seedFromFiles` (crea desde los archivos lo que falte en la base; nunca pisa lo existente), después los valores por defecto que falten. Catálogo: en una base sin agentes, skills ni orquestadores valida todos los archivos (esquema y referencias entre ellos) y, si alguno es inválido, cancela sin crear nada; si no, instala todo como v1 `ACTIVE` en una transacción (lo instala el propietario al configurar la plataforma; auditoría `SEED_AGENT`, `SEED_SKILL`, `SEED_ORCHESTRATOR`). En una base con catálogo solo informa el estado. Ya no hay definiciones en código (`seed/agents.ts`, `skills.ts` y `orchestrators.ts` se borraron).
- API (`syncCatalogFilesOnStartup`, `apps/api/src/routes/catalog-files.ts`): antes de escuchar, según `MAO_CATALOG_SYNC` (`sync` por defecto, `export` u `off`; un valor inválido usa `sync` con aviso) reconcilia el catálogo y resume en una línea; de la configuración escribe desde la base los archivos que faltan o quedaron viejos e informa los que tienen cambios sin aplicar (nunca los pisa ni los aplica). Base sin catálogo → aviso para correr el seed (y la configuración solo se informa). Nunca impide arrancar.
- `pnpm catalog:status|sync|export` (`core/catalog/run-sync.ts`): lo mismo sin API, con actor de sistema y la base de `DATABASE_URL`; en `export` y `sync` también exporta la configuración (nunca la aplica). Sale con código 1 si hay archivos inválidos.

**Limitaciones conocidas**: los cambios en los archivos se detectan al arrancar o a pedido, no en vivo; borrar un archivo no desactiva nada (se vuelve a escribir desde la base); con dos máquinas sobre la misma base conviene hacer `git pull` antes de iniciar la API, para que el arranque importe lo ya versionado en lugar de reescribir archivos viejos; el resumen de una línea está duplicado (`summarizeCatalogReports` en core y `catalogFilesSummary` en la API).

## Estados

Ejecución: `PENDING → RUNNING → (WAITING_APPROVAL | RETRYING) → COMPLETED | FAILED | CANCELLED`.
Etapa: `PENDING → RUNNING → COMPLETED | WAITING_APPROVAL | RETRYING | FAILED | SKIPPED | CANCELLED`.

## Errores clasificados

`AUTH_ERROR`, `MCP_DISCONNECTED`, `TOOL_UNAVAILABLE`, `MODEL_RATE_LIMIT`, `INVALID_RESPONSE`, `VERSION_CONFLICT`, `VALIDATION_ERROR`, `AUTHORIZATION_ERROR`, `JIRA_ERROR`, `TIMEOUT`, `CANCELLED`, `NOT_FOUND`, `INTERNAL`. Reintentables: MCP, límite de modelo, respuesta inválida, Jira, timeout, interno; backoff exponencial con jitter.

## Seguridad local

Loopback en API, web y PostgreSQL local (con Railway, la base es remota: TLS obligatorio por `sslmode=require`, credenciales solo en `.env`) · token del propietario (comparación en tiempo constante) · validación de `Host` y `Origin` · anti-CSRF · Zod en todas las entradas · secretos redactados en auditoría/eventos · conexiones sin secretos (referencian `--env-file`) · archivos de `catalog/` sin secretos (proveedores solo con el nombre de la variable de la API key, conexiones solo con la ruta del archivo de credenciales, filtro de claves con forma de credencial) · ningún comando arbitrario: los únicos procesos lanzados son el servidor MCP configurado y `claude` con argumentos fijos y sin herramientas.
