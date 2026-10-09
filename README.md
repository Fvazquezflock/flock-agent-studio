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
| Instalador del servidor MCP de Jira (`scripts/setup-mcp.ps1`) | Implementado y verificado (instalación nueva: 63 herramientas) |
| Escritura real en Jira | Implementada, **deshabilitada por defecto** y no probada contra Jira real (solo contra Jira simulado) |
| `MockModelProvider` (simulación determinística) | Implementado; solo se crea con datos demo (`MAO_SEED_DEMO=true`) y lo usan las pruebas |
| `LocalClaudeRunner` (`claude -p`) | Implementado y verificado con modelo real (flujo A sobre `SCRUM-5`); es el proveedor por defecto; requiere sesión de Claude Code (`claude auth login`) |
| Datos de demostración (proyecto `DEMO` y proveedor simulado) | Implementado, opcionales (`MAO_SEED_DEMO=true`); por defecto no se crean |
| `AnthropicApiProvider` (SDK oficial) | Implementado; **no configurado** (falta `ANTHROPIC_API_KEY`) |
| Editor visual drag-and-drop de orquestadores | Pendiente (hay editor por formularios + diagrama) |
| Usuarios, roles y autenticación multiusuario | Pendiente (MVP con propietario único + token) |

Detalle y bitácora: [PROGRESS.md](PROGRESS.md).

## Requisitos

- Windows 10/11 con PowerShell, Node.js 22+ (probado con 24.15).
- pnpm 10 (el script de instalación lo instala si falta).
- PostgreSQL de trabajo: **Railway** (remoto, configurado en esta PC), **embebido** (sin Docker, incluido) o Docker Desktop (`docker compose up -d`, mismo puerto y credenciales). Las pruebas de integración usan siempre el embebido local (`mao_test`).
- Opcional: Claude Code CLI con sesión iniciada (`claude auth login`) o una API key de Anthropic.
- Para trabajar con Jira: git y `uv` (recomendado: instala Python solo; `winget install astral-sh.uv`) o un Python 3.10+ real, para instalar el servidor MCP con `scripts\setup-mcp.ps1` (ver *Servidor MCP de Jira*). No hace falta copiar `MCP/` aparte.

## Instalación

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
```

Hace: verifica Node, instala pnpm si falta, crea `.env` (con un `MAO_OWNER_TOKEN` aleatorio), instala dependencias, levanta PostgreSQL embebido en `127.0.0.1:5433` (base de pruebas y, por defecto, de trabajo), aplica migraciones y carga datos iniciales en la base de `DATABASE_URL` (catálogo, políticas, proveedores y la conexión `jira-mcp`; sin datos demo, ver *Datos de demostración*) y genera los estilos del design system. Con Docker: `-UseDocker`. Para usar Railway, configurá `DATABASE_URL` **antes** de correrlo (ver abajo). El servidor MCP de Jira se instala aparte con `scripts\setup-mcp.ps1`.

### Servidor MCP de Jira

`MCP/mcp-atlassian` no se versiona en este repo: es el proyecto público [sooperset/mcp-atlassian](https://github.com/sooperset/mcp-atlassian) (licencia MIT), guarda las credenciales en su `.env` y trae un entorno Python pesado. Se instala con:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\setup-mcp.ps1 [-Ref ec54351] [-Dir MCP\mcp-atlassian] [-Force]
```

- Requiere git y `uv` (recomendado; `winget install astral-sh.uv`) o un Python 3.10+ real (ignora el acceso directo de Microsoft Store).
- Crea `MCP\mcp-atlassian\.venv` e instala `mcp-atlassian` desde GitHub fijado en el commit verificado `ec54351` (63 herramientas, incluidas las de transición). Si ya está instalado no reinstala, salvo con `-Force`.
- Si no existe, crea `MCP\mcp-atlassian\.env` desde la plantilla `scripts\mcp-atlassian.env.example`. Nunca pisa un `.env` existente.
- Después: completá `JIRA_URL`, `JIRA_USERNAME` y `JIRA_API_TOKEN` en ese `.env` (el token se genera en https://id.atlassian.com/manage-profile/security/api-tokens), iniciá la plataforma y corré `pnpm mao doctor --mcp` (tiene que dar CONNECTED con 63 herramientas).

Detalle en [MCP_INTEGRATION.md](MCP_INTEGRATION.md) → *Instalación*.

### Varias conexiones Jira (otros sitios o cuentas)

Una conexión es un sitio de Jira con su cuenta: el mismo servidor MCP, otro archivo de credenciales (`JIRA_URL`, `JIRA_USERNAME`, `JIRA_API_TOKEN`). Sirve para trabajar con varios dominios de Jira o con cuentas de distintas personas. La plataforma solo guarda la ruta del archivo, nunca las credenciales.

1. Creá el archivo desde la plantilla (dentro de `MCP/`, ignorado por git): `powershell -ExecutionPolicy Bypass -File scripts\setup-mcp.ps1 -EnvFile MCP\mcp-atlassian\cliente-x.env` y completalo.
2. *Configuración → Ajustes generales → Conexiones MCP → Nueva conexión Jira*: clave (p. ej. `jira-cliente-x`), nombre y archivo de credenciales. También por API: `POST /api/connections { key, name, envFile }` y `PATCH /api/connections/:key`.
3. *Diagnosticar* la conexión y, en la ficha del proyecto (*Configuración → Proyectos*), elegirla en *Conexión*.

Reglas: el archivo tiene que estar dentro de `MCP/` y terminar en `.env` (se rechazan rutas absolutas o con `..`); el ejecutable es siempre el del servidor MCP configurado (`MAO_JIRA_MCP_COMMAND`), no se acepta un comando arbitrario; cada conexión arranca con la escritura deshabilitada y se habilita por separado. Credenciales por usuario de la plataforma: pendiente (hoy cada conexión tiene una cuenta).

### Datos de demostración

`pnpm db:seed` (y `setup.ps1`) **no** crean el proyecto `DEMO` ni el proveedor simulado: sin demo, el proveedor por defecto es Claude Code local (`claude-local`) y se trabaja contra el Jira registrado (en una base nueva el seed no crea proyectos: crealo como se indica en *Activar la integración real con Jira*). Para tenerlos, poné `MAO_SEED_DEMO=true` en `.env` (documentado en `.env.example`) y corré `pnpm db:seed`. Las pruebas de integración los crean siempre (vitest fija `MAO_SEED_DEMO=true`).

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

Hay dos caminos: contra el Jira real con Claude Code (el normal) o con los datos demo simulados.

### Con Jira real y Claude Code (UI)

Requiere el servidor MCP instalado y diagnosticado (*Servidor MCP de Jira*), sesión de Claude Code (`claude auth login`) y un proyecto en modo *Jira real*: en la base de Railway ya está `SCRUM`; en una base nueva, crealo como se indica en *Activar la integración real con Jira*.

1. **Backlog de Jira** → proyecto `SCRUM` → desplegá la épica `SCRUM-5`.
2. *Analizar épica* (flujo A) sobre `SCRUM-5`, o *Validar HU* (flujo B) sobre una de sus historias (por ejemplo `SCRUM-7`). Se abre *Nueva ejecución* precargada: dejá el proveedor *Claude Code local* (por defecto) e iniciá.
3. Seguí el flujo en vivo (con modelo real, el flujo A sobre `SCRUM-5` tardó unos 11 minutos y consume la cuota de la cuenta de Claude). En *Aprobación* revisá, editá, aprobá (individual o por lote) o *Rechazar y regenerar*. Con la escritura deshabilitada (por defecto) la publicación queda **bloqueada** y no se escribe nada en Jira.

### Con datos demo (UI)

Requiere `MAO_SEED_DEMO=true` y `pnpm db:seed` (ver *Datos de demostración*); en la base de Railway el proyecto `DEMO` ya no existe. Elegí el proveedor simulado.

1. **Nueva ejecución** → proyecto `DEMO` → `Épica → Historias → Tareas` → épica `DEMO-100` → *Iniciar*. Seguí el flujo en vivo; al llegar a *Aprobación* entrá en la solicitud, editá lo que quieras, aprobá (individual o por lote) o *Rechazar y regenerar*. La publicación es **simulada** (claves `SIM-n-m`).
2. Lo mismo con `HU existente → Validación → Tareas` y la historia `DEMO-102`: diagnóstico, diferencias original/propuesto, tareas faltantes (la de backend se detecta como duplicada de `DEMO-112`).
3. **Propuestas** (*Configuración → Propuestas*): el supervisor detecta que "Oracle SQL" no está cubierto (si la skill `OracleSQLValidation` todavía no existe) y deja una propuesta en borrador. La pantalla muestra el plan de implementación (crear la skill, activarla y agregarla a las skills del proyecto de origen, con los agentes que la van a recibir). *Confirmar e implementar* registra tu aprobación de cada paso y aplica todo; también podés *Enviar a aprobación* y decidir cada paso desde *Aprobaciones*. Si la definición tiene errores, *Regenerar diseño* le pide una nueva a CapabilityDesigner. Cada propuesta indica si **crea**, **modifica** (nueva versión de una capacidad existente, que se activa) o **cancela** una capacidad (la quita de las skills del proyecto de origen y la desactiva en el catálogo), con la evidencia que la justifica: la columna *Acción* del listado y la tarjeta *Qué propone y por qué* del detalle muestran el problema, la justificación y las inconsistencias o brechas encontradas.

### Desde la terminal (o Claude Code)

```powershell
# Jira real (SCRUM) con Claude Code
pnpm mao ask "Analizá la épica SCRUM-5 y proponé historias y tareas técnicas." --project SCRUM --wait
pnpm mao run STORY_REVIEW_AND_DECOMPOSITION --project SCRUM --story SCRUM-7 --provider claude-local --wait
# Datos demo (requiere MAO_SEED_DEMO=true)
pnpm mao ask "Analizá la épica DEMO-100 y proponé historias y tareas técnicas." --wait
pnpm mao run STORY_REVIEW_AND_DECOMPOSITION --project DEMO --story DEMO-102 --wait
# Aprobaciones
pnpm mao approvals
pnpm mao approval 1                                   # muestra ítems y hash de confirmación
pnpm mao approve 1 --batch --confirm <hash>
pnpm mao approve 1 --items story:update --confirm <hash>
pnpm mao result EX-1
```

En Claude Code basta con pedir *"Analizá la épica SCRUM-5 y proponé historias y tareas técnicas"* (o `DEMO-100` con datos demo): la skill `.claude/skills/mao-platform` usa la CLI y pide confirmación antes de aprobar. Las ejecuciones aparecen en la UI con origen *Claude Code*.

## Pruebas

```powershell
pnpm test              # unitarias + integración (89 pruebas)
pnpm test:unit
pnpm test:integration  # recrea la base mao_test; usa un Jira simulado; nunca escribe en Jira real
pnpm typecheck
```

## Activar la integración real con Jira

1. Lectura (ya funciona): instalá el servidor MCP y completá su `.env` (ver *Servidor MCP de Jira*), creá un proyecto en modo **Jira real** con la conexión `jira-mcp`, ejecutá *Descubrir tipos y campos* y mapeá los tipos reales (por ejemplo, el proyecto `SCRUM` usa `Epic`/`Historia`/`Tarea`/`Subtask`). `node scripts/verify-jira-read.mjs SCRUM SCRUM-1` y `node scripts/verify-live-flow.mjs SCRUM SCRUM-1` lo verifican sin escribir. Si querés que se puedan cancelar historias, elegí también la *Transición para cancelar historias* (ver *Aprobaciones: qué se propone y por qué*).
2. Escritura (deshabilitada): en un **entorno de prueba autorizado**, poné `MAO_ALLOW_JIRA_WRITES=true` en `.env`, reiniciá API y worker, y en *Configuración → Ajustes generales → Conexiones MCP* habilitá la escritura escribiendo `HABILITAR ESCRITURA`. Verificá antes en ese entorno la semántica de vínculos (`inward/outward`) y del campo `parent` (ver [MCP_INTEGRATION.md](MCP_INTEGRATION.md)).
3. Modelo real: `claude auth login` para el runner local, o `ANTHROPIC_API_KEY` para la API; luego elegí el proveedor en *Configuración → Ajustes generales → Proveedores de IA*.

## Documentación

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [AGENTS.md](AGENTS.md) · [WORKFLOWS.md](WORKFLOWS.md) · [MCP_INTEGRATION.md](MCP_INTEGRATION.md) · [APPROVAL_POLICIES.md](APPROVAL_POLICIES.md) · [ROADMAP.md](ROADMAP.md) · [CLAUDE.md](CLAUDE.md) · [PROGRESS.md](PROGRESS.md) · [design-system/README.md](design-system/README.md)
