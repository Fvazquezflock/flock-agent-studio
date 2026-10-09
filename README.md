# Multi-Agent Orchestration Studio

Plataforma multiagente local, configurable, auditable y extensible. Primer caso de uso: **mejorar y completar historias de usuario y tareas técnicas en Jira**, con aprobación humana obligatoria antes de cualquier escritura.

- **Dos puntos de entrada, un motor**: interfaz web (Next.js) y CLI `mao` (usable desde Claude Code con la skill `mao-platform`). Ambos llaman a la misma API, comparten ejecuciones, estados, aprobaciones y auditoría.
- **La IA propone, el backend decide**: los agentes no tienen herramientas de escritura; toda operación externa pasa por un servicio que verifica aprobación (sobre el mismo contenido), política vigente y habilitación de escritura.
- **Todo persistido**: agentes, skills y orquestadores versionados en PostgreSQL; ejecuciones recuperables tras reinicio; eventos en vivo por SSE.
- **Design system Flock IT** (`design-system/`) aplicado a toda la UI.

## Estado

| Área | Estado |
| --- | --- |
| Motor de ejecución persistente (DAG, paralelismo, reintentos, leases, recuperación, cancelación) | Implementado y probado |
| Orquestador A `EPIC_TO_STORIES_AND_TASKS` | Implementado (demo y Jira real en lectura) |
| Orquestador B `STORY_REVIEW_AND_DECOMPOSITION` | Implementado (demo y Jira real en lectura, verificado con `SCRUM-1`) |
| Aprobaciones (individual/lote, edición con revisiones, regenerar, conflictos de versión) | Implementado y probado |
| Acción y motivo de cada operación (Crear/Modificar/Cancelar, por qué, evidencia); cancelar HU por transición en Jira | Implementado y probado contra Jira simulado; en la CLI, pendiente |
| Políticas configurables (global → proyecto → operación, piso de seguridad) | Implementado y probado |
| Catálogo versionado (crear, editar, duplicar, comparar, probar, activar, desactivar, restaurar) | Implementado |
| Autoevolución supervisada (propuesta → plan crear/activar/asignar → una confirmación con aprobación individual de cada paso) | Implementado y probado |
| MCP Jira (stdio, mcp-atlassian): diagnóstico, mapa de capacidades, lectura real | Implementado y verificado contra Jira Cloud |
| Escritura real en Jira | Implementada, **deshabilitada por defecto** y no probada contra Jira real (solo contra Jira simulado) |
| `MockModelProvider` (simulación determinística) | Implementado (es el proveedor por defecto) |
| `LocalClaudeRunner` (`claude -p`) | Implementado y verificado con modelo real (EX-13, flujo A sobre `SCRUM-5`); requiere sesión de Claude Code (`claude auth login`) |
| `AnthropicApiProvider` (SDK oficial) | Implementado; **no configurado** (falta `ANTHROPIC_API_KEY`) |
| Editor visual drag-and-drop de orquestadores | Pendiente (hay editor por formularios + diagrama) |
| Usuarios, roles y autenticación multiusuario | Pendiente (MVP con propietario único + token) |

Detalle y bitácora: [PROGRESS.md](PROGRESS.md).

## Requisitos

- Windows 10/11 con PowerShell, Node.js 22+ (probado con 24.15).
- pnpm 10 (el script de instalación lo instala si falta).
- PostgreSQL de trabajo: **Railway** (remoto, configurado en esta PC), **embebido** (sin Docker, incluido) o Docker Desktop (`docker compose up -d`, mismo puerto y credenciales). Las pruebas de integración usan siempre el embebido local (`mao_test`).
- Opcional: Claude Code CLI con sesión iniciada (`claude auth login`) o una API key de Anthropic.
- Opcional: el servidor MCP de Jira en `MCP/mcp-atlassian` con su `.env`.

## Instalación

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Hace: verifica Node, instala pnpm si falta, crea `.env` (con un `MAO_OWNER_TOKEN` aleatorio), instala dependencias, levanta PostgreSQL embebido en `127.0.0.1:5433` (base de pruebas y, por defecto, de trabajo), aplica migraciones y carga datos iniciales en la base de `DATABASE_URL` y genera los estilos del design system. Con Docker: `-UseDocker`. Para usar Railway, configurá `DATABASE_URL` **antes** de correrlo (ver abajo).

### Base de datos en Railway

La base de trabajo (API, worker, seed, migraciones) puede ser un PostgreSQL de Railway; las pruebas siguen en `mao_test` local.

1. En Railway, servicio PostgreSQL → *Variables* → copiá `DATABASE_PUBLIC_URL` (host `*.proxy.rlwy.net`).
2. En `.env`, reemplazá `DATABASE_URL` por esa URL agregando `?schema=public&sslmode=require&connect_timeout=15`. **No omitas `sslmode=require`**: el proxy de Railway también acepta conexiones sin cifrar. `.env` no se sube al repositorio.
3. `pnpm db:migrate` y `pnpm db:seed` (idempotente).
4. Opcional, para llevar los datos que ya tenías en la base local: `node scripts/db-copy.mjs --from local --to DATABASE_URL` (probalo antes con `--dry-run`). Exige mismas migraciones y destino vacío, copia todo en una transacción y ajusta las secuencias (`EX-n`, `AP-n`).
5. `scripts\start.ps1` detecta que la base es remota y no inicia el PostgreSQL embebido; para `pnpm test` hace falta `pnpm db:start`.

Para volver a la base local, restaurá la línea `DATABASE_URL` local (queda comentada en `.env`). `pnpm doctor` y *Configuración → Ajustes generales → Estado de servicios* muestran qué base está en uso (host, sin credenciales) y si la conexión va cifrada. Con ~150 ms por consulta todo funciona, pero más lento que en local (flujo A de punta a punta ≈ 45 s; aprobación en lote de 29 ítems ≈ 17 s). Los timeouts de transacción se ajustan con `MAO_DB_TX_TIMEOUT_MS` (60 s por defecto) y `MAO_DB_TX_MAX_WAIT_MS` (10 s).

## Ejecución

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1              # una ventana por servicio
powershell -ExecutionPolicy Bypass -File scripts\start.ps1 -Background  # oculto, logs en .data\logs
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 [-Db]
```

- UI: http://127.0.0.1:3000
- API: http://127.0.0.1:4317 (solo loopback, token del propietario)
- Por separado: `pnpm db:start` (solo si la base de trabajo es local, o para las pruebas), `pnpm dev:api`, `pnpm dev:worker`, `pnpm dev:web`.

Diagnóstico (Disponible / No configurado / Error, sin imprimir credenciales):

```powershell
pnpm doctor            # local
pnpm mao doctor --mcp  # además inicia el MCP de Jira y diagnostica proveedores en vivo
```

## Elegir qué analizar: backlog de Jira

*Backlog de Jira* (menú *Operación*, o *Ver backlog* en la ficha del proyecto) lista las épicas abiertas del proyecto. Desplegando una épica se ven sus historias, y la pestaña *Historias* muestra las que no tienen épica (o todas, si sacás el filtro). Hay búsqueda por clave o texto y la opción de incluir terminadas.

- **Analizar épica** → flujo A (`EPIC_TO_STORIES_AND_TASKS`): análisis de la épica completa, historias faltantes y tareas.
- **Validar HU** → flujo B (`STORY_REVIEW_AND_DECOMPOSITION`): diagnóstico de una historia sola, mejoras y tareas.

Los dos botones abren *Nueva ejecución* con proyecto, orquestador y clave completados: elegís el proveedor de IA y confirmás. La pantalla solo lee Jira (usa los tipos de épica e historia mapeados en el proyecto) y muestra hasta 50 resultados por consulta; si hay más, avisa y conviene refinar la búsqueda. Desde la terminal:

```powershell
pnpm mao backlog --project SCRUM                    # épicas abiertas
pnpm mao backlog --project SCRUM --epic SCRUM-5     # historias de la épica
pnpm mao backlog --project SCRUM --stories --sin-epica
pnpm mao backlog --project SCRUM --buscar "reclamos" --todas
```

## Consumo de tokens

Cada invocación de modelo queda registrada (`ModelInvocation`) con su agente, tarea, ejecución, etapa e intento, y los tokens de entrada, salida, caché escrita y caché leída. Se registran también los reintentos y las respuestas que no cumplieron el contrato, porque igual consumen.

- Detalle de cada ejecución → tarjeta *Consumo de tokens* (total y por agente).
- *Configuración → Consumo de IA*: período y proyecto, totales, por agente, origen (ejecuciones, planificación del supervisor, pruebas de catálogo), proveedor y ejecuciones con más consumo.
- CLI: `pnpm mao usage EX-13` (por agente) y `pnpm mao usage --days 30 [--project SCRUM]`.

El "costo estimado" es el equivalente a precio de API que informa el proveedor. Con Claude Code y sesión de claude.ai (suscripción) no es un cargo: consume el uso incluido en el plan. Con Claude Code, `input_tokens` solo cuenta la entrada sin caché; la mayor parte de la entrada va a caché y por eso se muestra aparte.

## Aprobaciones: qué se propone y por qué

Cada operación de una solicitud de aprobación muestra una insignia **Crear**, **Modificar** o **Cancelar** y un bloque **Por qué**:

- Historia nueva: qué parte de la épica no cubren las historias existentes, con evidencia.
- Tarea nueva: por qué hace falta para implementar la historia.
- Vínculo: el motivo de la dependencia.
- Cambios en una HU (flujo B): las inconsistencias concretas que encontró la validación (con severidad y evidencia) y la justificación de cada cambio.
- Cancelar una HU (grupo *Historias a cancelar*): si sobra por duplicada, fuera de alcance u obsoleta, con la explicación y la evidencia.

**Cancelar es una transición real en Jira** (operación `TRANSITION_ISSUE`, siempre con aprobación individual): la HU pasa al estado de cancelación del proyecto y en Jira queda un comentario con el motivo. Antes de transicionar se verifica que la HU no haya cambiado desde que se leyó; si cambió, se genera una *Revisión por conflicto*. Para que funcione en un proyecto Jira real hay que mapear la transición:

1. *Configuración → Proyectos* → el proyecto → pestaña *Jira* → *Descubrir tipos y campos* (también lee las transiciones de una historia de muestra).
2. En *Transición para cancelar historias*, elegí la transición que lleva al estado de cancelación.

Sin transición mapeada, la publicación real omite esas cancelaciones con el aviso "Falta mapear la transición de cancelación…" (el resto se publica igual). El proyecto de prueba `SCRUM` no tiene estado de cancelación: hay que agregar uno ("Cancelada") en el flujo de Jira o mapear uno existente. En modo demo la cancelación es simulada, como el resto de la publicación. Por ahora la acción y el motivo solo se ven en la UI (`pnpm mao approval` todavía no los muestra).

## Probar los dos flujos

### Desde la UI

1. **Nueva ejecución** → proyecto `DEMO` → `Épica → Historias → Tareas` → épica `DEMO-100` → *Iniciar*. Seguí el flujo en vivo; al llegar a *Aprobación* entrá en la solicitud, editá lo que quieras, aprobá (individual o por lote) o *Rechazar y regenerar*. La publicación es **simulada** (claves `SIM-n-m`).
2. Lo mismo con `HU existente → Validación → Tareas` y la historia `DEMO-102`: diagnóstico, diferencias original/propuesto, tareas faltantes (la de backend se detecta como duplicada de `DEMO-112`).
3. **Propuestas** (*Configuración → Propuestas*): el supervisor detecta que "Oracle SQL" no está cubierto y deja la propuesta `CP-1` en borrador. La pantalla muestra el plan de implementación (crear la skill, activarla y agregarla a las skills del proyecto de origen, con los agentes que la van a recibir). *Confirmar e implementar* registra tu aprobación de cada paso y aplica todo; también podés *Enviar a aprobación* y decidir cada paso desde *Aprobaciones*. Si la definición tiene errores, *Regenerar diseño* le pide una nueva a CapabilityDesigner. Cada propuesta indica si **crea**, **modifica** (nueva versión de una capacidad existente, que se activa) o **cancela** una capacidad (la quita de las skills del proyecto de origen y la desactiva en el catálogo), con la evidencia que la justifica: la columna *Acción* del listado y la tarjeta *Qué propone y por qué* del detalle muestran el problema, la justificación y las inconsistencias o brechas encontradas.

### Desde la terminal (o Claude Code)

```powershell
pnpm mao ask "Analizá la épica DEMO-100 y proponé historias y tareas técnicas." --wait
pnpm mao run STORY_REVIEW_AND_DECOMPOSITION --project DEMO --story DEMO-102 --wait
pnpm mao approvals
pnpm mao approval 1                                   # muestra ítems y hash de confirmación
pnpm mao approve 1 --batch --confirm <hash>
pnpm mao approve 1 --items story:update --confirm <hash>
pnpm mao result EX-1
```

En Claude Code basta con pedir *"Analizá la épica DEMO-100 y proponé historias y tareas técnicas"*: la skill `.claude/skills/mao-platform` usa la CLI y pide confirmación antes de aprobar. Las ejecuciones aparecen en la UI con origen *Claude Code*.

## Pruebas

```powershell
pnpm test              # unitarias + integración (89 pruebas)
pnpm test:unit
pnpm test:integration  # recrea la base mao_test; usa un Jira simulado; nunca escribe en Jira real
pnpm typecheck
```

## Activar la integración real con Jira

1. Lectura (ya funciona): creá un proyecto en modo **Jira real** con la conexión `jira-mcp`, ejecutá *Descubrir tipos y campos* y mapeá los tipos reales (por ejemplo, el proyecto `SCRUM` usa `Epic`/`Historia`/`Tarea`/`Subtask`). `node scripts/verify-jira-read.mjs SCRUM SCRUM-1` y `node scripts/verify-live-flow.mjs SCRUM SCRUM-1` lo verifican sin escribir. Si querés que se puedan cancelar historias, elegí también la *Transición para cancelar historias* (ver *Aprobaciones: qué se propone y por qué*).
2. Escritura (deshabilitada): en un **entorno de prueba autorizado**, poné `MAO_ALLOW_JIRA_WRITES=true` en `.env`, reiniciá API y worker, y en *Configuración → Ajustes generales → Conexiones MCP* habilitá la escritura escribiendo `HABILITAR ESCRITURA`. Verificá antes en ese entorno la semántica de vínculos (`inward/outward`) y del campo `parent` (ver [MCP_INTEGRATION.md](MCP_INTEGRATION.md)).
3. Modelo real: `claude auth login` para el runner local, o `ANTHROPIC_API_KEY` para la API; luego elegí el proveedor en *Configuración → Ajustes generales → Proveedores de IA*.

## Documentación

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [AGENTS.md](AGENTS.md) · [WORKFLOWS.md](WORKFLOWS.md) · [MCP_INTEGRATION.md](MCP_INTEGRATION.md) · [APPROVAL_POLICIES.md](APPROVAL_POLICIES.md) · [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [PROGRESS.md](PROGRESS.md) · [design-system/README.md](design-system/README.md)
