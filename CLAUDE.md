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
- `packages/core` — dominio: catálogo versionado, motor de ejecución, aprobaciones, políticas, publicación, proveedores de IA, cliente MCP, supervisor, propuestas, seed.
- `apps/api` (Fastify), `apps/worker`, `apps/cli` (`pnpm mao`), `apps/web` (Next.js 15 + Tailwind + design system Flock IT).
- `design-system/` — sistema de diseño Flock IT (fuente: `tokens.json`; `pnpm tokens` regenera `apps/web/styles`).
- `MCP/mcp-atlassian` — servidor MCP de Jira existente (repo aparte, con secretos en `.env`). **No modificar ni commitear.**

## Comandos

```bash
pnpm install
pnpm db:start | db:stop | db:migrate | db:seed
pnpm dev:api | dev:worker | dev:web
pnpm mao help
pnpm test | test:unit | test:integration
pnpm typecheck
```

## Reglas del proyecto

- La IA propone; el backend decide qué se ejecuta. Toda escritura externa pasa por `PublicationService` con aprobación vigente sobre el mismo hash, política re-evaluada y escritura habilitada (conexión + `MAO_ALLOW_JIRA_WRITES`).
- Nunca exponer herramientas de escritura a los agentes (`GRANTABLE_TOOLS` es solo lectura). Nunca mapear `jira_delete_issue`.
- El modo demo y el proveedor mock se muestran siempre como simulación.
- No inventar campos ni tipos de Jira: se descubren con el conector.
- Definiciones (agentes, skills, orquestadores, config) son versionadas e inmutables salvo en borrador; las ejecuciones fijan versiones.
- No guardar secretos en la base ni en logs (`sanitize`). Las conexiones referencian archivos o nombres de variables.
- Textos de UI en español rioplatense (voseo), sentence case, sin emojis; usar clases `fk-*` y tokens del design system.
- Fechas en SQL crudo: comparar contra `now() AT TIME ZONE 'UTC'` (Prisma guarda timestamps UTC sin zona).
- En Windows PowerShell 5.1 no edites archivos UTF-8 con `Get-Content`/`Set-Content` (rompe acentos): usá el editor o scripts Node.
- Las pruebas de integración usan la base `mao_test` local (se recrea en cada corrida) y un Jira simulado; nunca escriben en Jira real ni en la base de Railway.
- Cambios de esquema con la base en Railway: no corras `pnpm db:migrate:dev` contra Railway (si detecta drift ofrece **resetear la base** y borraría los datos). Generá la migración contra la base local (restaurá temporalmente la `DATABASE_URL` local comentada en `.env`), volvé a Railway y aplicala con `pnpm db:migrate` (`migrate deploy`, no destructivo).

## Documentación a mantener

`README.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, `AGENTS.md`, `WORKFLOWS.md`, `MCP_INTEGRATION.md`, `APPROVAL_POLICIES.md`, `ROADMAP.md`, `PROGRESS.md`. Marcá siempre: implementado, parcial, pendiente o bloqueado.
