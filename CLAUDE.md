# CLAUDE.md — Multi-Agent Orchestration Studio

Instrucciones para sesiones de Claude Code que **desarrollan** este repositorio. (Para **usar** la plataforma desde Claude Code está la skill `.claude/skills/mao-platform`.) Los permisos de Claude Code para desarrollar no son los permisos de los agentes operativos de la plataforma.

## Empezá por acá

1. Leé `PROGRESS.md` (estado, pendientes, cómo retomar).
2. La base de trabajo es la de `DATABASE_URL` en `.env` (hoy: PostgreSQL en Railway, remoto con TLS). `pnpm db:start` (PostgreSQL embebido en 127.0.0.1:5433) hace falta igual para las pruebas (`mao_test`), o si la base de trabajo es local. Alternativa: `docker compose up -d`.
3. `pnpm test` antes y después de tus cambios.
4. Si el contexto se está agotando: actualizá `PROGRESS.md` antes de cortar.

## Estructura

- `packages/shared` — enums, esquemas Zod (definiciones, contratos de tareas, API) y formato AR.
- `packages/db` — Prisma (`prisma/schema.prisma`, migraciones). `pnpm db:migrate:dev --name x` para cambios de esquema.
- `packages/core` — dominio: catálogo versionado, motor de ejecución, aprobaciones, políticas, publicación, proveedores de IA, cliente MCP, supervisor, propuestas, seed, sincronización con `catalog/` (`catalog/sync-service.ts`, `config/config-files.ts`).
- `catalog/` — fuente de verdad versionada: `agents/<Clave>.md`, `skills/<Clave>/SKILL.md`, `orchestrators/<CLAVE>.yaml`, `global.yaml`, `policies.yaml`, `connections.yaml`, `providers.yaml`, `projects/<CLAVE>.yaml` (sin secretos ni proyectos DEMO). La base guarda copia de cada versión. Ver ARCHITECTURE.md → *Catálogo y configuración en archivos*.
- `apps/api` (Fastify), `apps/worker`, `apps/cli` (`pnpm mao`), `apps/web` (Next.js 15 + Tailwind + design system Flock IT).
- `design-system/` — sistema de diseño Flock IT (fuente: `tokens.json`; `pnpm tokens` regenera `apps/web/styles`).
- `MCP/mcp-atlassian` — servidor MCP de Jira (proyecto público sooperset/mcp-atlassian, MIT; repo aparte, con secretos en `.env`). No se versiona en este repo: se instala con `scripts/setup-mcp.ps1` (fijado en el commit `ec54351`; plantilla de credenciales en `scripts/mcp-atlassian.env.example`). **No modificar ni commitear.**

## Comandos

```bash
pnpm install
pnpm db:start | db:stop | db:migrate | db:seed
pnpm dev:api | dev:worker | dev:web
pnpm mao help
pnpm mao files [sync | export | apply]      # estado y sincronización de catalog/ (vía API)
pnpm catalog:status | catalog:sync | catalog:export   # lo mismo sin API, contra la base de DATABASE_URL
pnpm test | test:unit | test:integration
pnpm typecheck
```

## Reglas del proyecto

- La IA propone; el backend decide qué se ejecuta. Toda escritura externa pasa por `PublicationService` con aprobación vigente sobre el mismo hash, política re-evaluada y escritura habilitada (conexión + `MAO_ALLOW_JIRA_WRITES`).
- Nunca exponer herramientas de escritura a los agentes (`GRANTABLE_TOOLS` es solo lectura). Nunca mapear `jira_delete_issue`.
- El modo demo y el proveedor mock se muestran siempre como simulación.
- No inventar campos ni tipos de Jira: se descubren con el conector.
- Definiciones (agentes, skills, orquestadores, config) son versionadas e inmutables salvo en borrador; las ejecuciones fijan versiones.
- Las definiciones se editan en `catalog/` o desde la UI y **nunca se activan sin aprobación**: un archivo cambiado se importa como versión pendiente de aprobación; la configuración editada a mano solo se aplica con acción explícita del propietario (`apply`). No agregues caminos que activen o apliquen archivos solos. La única excepción es la instalación inicial (`pnpm db:seed` en una base sin catálogo).
- Las definiciones iniciales ya no están en código: para cambiarlas, editá `catalog/` (no hay `seed/agents.ts` ni similares).
- Las pruebas nunca escriben en `catalog/`: usan una copia del catálogo base fijo `packages/core/test/fixtures/catalog/` en `.data/test-catalog` (`MAO_CATALOG_DIR`, recreada por `global-setup`, obligatoriamente dentro de `.data/`).
- `pnpm catalog:*` corre contra la base de `DATABASE_URL` (hoy Railway): `catalog:sync` importa versiones pendientes y crea solicitudes de aprobación en esa base, y `catalog:export --sobrescribir` pisa sin confirmar los archivos con cambios sin importar. Usá `catalog:status` para mirar (no escribe archivos; a lo sumo registra en `GlobalSetting` `catalog.files` el hash de los archivos de configuración al día).
- No guardar secretos en la base ni en logs (`sanitize`). Las conexiones referencian archivos o nombres de variables.
- Textos de UI en español rioplatense (voseo), sentence case, sin emojis; usar clases `fk-*` y tokens del design system.
- Fechas en SQL crudo: comparar contra `now() AT TIME ZONE 'UTC'` (Prisma guarda timestamps UTC sin zona).
- En Windows PowerShell 5.1 no edites archivos UTF-8 con `Get-Content`/`Set-Content` (rompe acentos): usá el editor o scripts Node.
- Las pruebas de integración usan la base `mao_test` local (se recrea en cada corrida) y un Jira simulado; nunca escriben en Jira real ni en la base de Railway.
- El seed (`pnpm db:seed`) no crea el proyecto `DEMO` ni el proveedor simulado salvo con `MAO_SEED_DEMO=true`; vitest lo fija para las pruebas de integración, que siguen usando `DEMO` y el proveedor simulado.
- Cambios de esquema con la base en Railway: no corras `pnpm db:migrate:dev` contra Railway (si detecta drift ofrece **resetear la base** y borraría los datos). Generá la migración contra la base local (restaurá temporalmente la `DATABASE_URL` local comentada en `.env`), volvé a Railway y aplicala con `pnpm db:migrate` (`migrate deploy`, no destructivo).

## Documentación a mantener

`README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `AGENTS.md`, `WORKFLOWS.md`, `MCP_INTEGRATION.md`, `APPROVAL_POLICIES.md`, `ROADMAP.md`, `PROGRESS.md`. Marcá siempre: implementado, parcial, pendiente o bloqueado.
