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
- **Handlers de etapa en código, flujos en datos**: el vocabulario ejecutable (`jira.context`, `agent.task`, `approval.gate`, `jira.publish`, `supervisor.review`) es fijo y auditable; los orquestadores son JSON versionado que los combina. Preparado para un editor visual.
- **Contexto Jira determinístico**: los agentes no reciben herramientas; los servicios leen Jira (solo lectura) y les pasan datos delimitados como no confiables.
- **SSE por sondeo de `ExecutionEvent`** (700 ms) con `Last-Event-ID`: simple, robusto y recuperable; sin estado en memoria.
- **Proxy en Next** en lugar de CORS: el token del propietario vive solo en servidores; mutaciones con encabezado anti-CSRF, `Sec-Fetch-Site` y control de `Origin`; ambos servidores validan `Host` (DNS rebinding).
- **Fechas**: Prisma guarda UTC sin zona; la SQL cruda compara contra `now() AT TIME ZONE 'UTC'` (bug encontrado por las pruebas).

## Estados

Ejecución: `PENDING → RUNNING → (WAITING_APPROVAL | RETRYING) → COMPLETED | FAILED | CANCELLED`.
Etapa: `PENDING → RUNNING → COMPLETED | WAITING_APPROVAL | RETRYING | FAILED | SKIPPED | CANCELLED`.

## Errores clasificados

`AUTH_ERROR`, `MCP_DISCONNECTED`, `TOOL_UNAVAILABLE`, `MODEL_RATE_LIMIT`, `INVALID_RESPONSE`, `VERSION_CONFLICT`, `VALIDATION_ERROR`, `AUTHORIZATION_ERROR`, `JIRA_ERROR`, `TIMEOUT`, `CANCELLED`, `NOT_FOUND`, `INTERNAL`. Reintentables: MCP, límite de modelo, respuesta inválida, Jira, timeout, interno; backoff exponencial con jitter.

## Seguridad local

Loopback en API, web y PostgreSQL local (con Railway, la base es remota: TLS obligatorio por `sslmode=require`, credenciales solo en `.env`) · token del propietario (comparación en tiempo constante) · validación de `Host` y `Origin` · anti-CSRF · Zod en todas las entradas · secretos redactados en auditoría/eventos · conexiones sin secretos (referencian `--env-file`) · ningún comando arbitrario: los únicos procesos lanzados son el servidor MCP configurado y `claude` con argumentos fijos y sin herramientas.
