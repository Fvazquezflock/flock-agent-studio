# Roadmap

## Próximo (para pasar del MVP a uso real)

- [Parcial] Ejecutar los flujos con un modelo real: el runner local (`claude auth login`) ya funciona (EX-13, flujo A sobre `SCRUM-5`); falta calibrar prompts y presupuestos con más corridas y probar la API (`ANTHROPIC_API_KEY`).
- [Bloqueado: entorno autorizado] Probar escrituras reales en un Jira de prueba (parent de subtareas/épicas, dirección de vínculos, etiquetas de correlación) y recién entonces habilitarlas.
- [Pendiente] Mapear campos personalizados (story points, sprint) desde la UI con los campos descubiertos y enviarlos en la publicación.
- [Pendiente] Prueba E2E de la UI automatizada (Playwright) para ambos flujos.
- [Implementado] Base de trabajo en Railway (`DATABASE_URL` remota con TLS) y `scripts/db-copy.mjs` para migrar datos entre bases.
- [Pendiente] Respaldos de la base en Railway (plan con backups o `pg_dump` programado) y rotación de la contraseña del servicio.
- [Pendiente] Instalar Docker Desktop (opcional).
- [Implementado] Acción (Crear/Modificar/Cancelar) y motivo con evidencia en cada ítem de aprobación y en cada propuesta de capacidad; cancelar una HU como transición real en Jira (`TRANSITION_ISSUE`, siempre aprobación individual).
- [Pendiente] Mostrar acción y motivo de cada ítem en la CLI (`pnpm mao approval`); hoy solo en la UI.
- [Pendiente] Que el modelo simulado genere recomendaciones de cancelar historias (hoy solo el modelo real o las pruebas).
- [Bloqueado: configuración de Jira] Cancelaciones en `SCRUM`: el flujo no tiene estado de cancelación (Idea, Por hacer, En curso, Testing, Listo). Agregar un estado "Cancelada" en Jira (o mapear uno existente) y elegirlo en *Transición para cancelar historias*.
- [Implementado] *Regenerar diseño* de CP-2 a CP-4 (2026-10-09): diseño regenerado con Claude Code; `RegulatoryComplianceAR`, `AccessibilityWCAG` e `IntegrationResiliencePatterns` creadas, activadas y agregadas a las skills de `SCRUM`.
- [Implementado] Instalador del servidor MCP de Jira (`scripts/setup-mcp.ps1`, fijado en `ec54351`) para quien clone el repo, en lugar de copiar `MCP/` aparte.
- [Implementado] Datos demo opcionales (`MAO_SEED_DEMO=true`); sin demo, el proveedor por defecto es Claude Code local. Base de trabajo reiniciada para la demo (ver PROGRESS.md).
- [Pendiente] Actualizar los ejemplos de la skill `.claude/skills/mao-platform` (usan `DEMO`) para el proyecto real.

- [Implementado] Varias conexiones Jira (distintos sitios y cuentas) con el mismo servidor MCP, cada una con su archivo de credenciales.
- [Pendiente] Credenciales de Jira por usuario de la plataforma (relevamiento de usuarios; hoy cada conexión tiene una cuenta).

## Mediano plazo

- Editor visual drag-and-drop de orquestadores (el modelo ya es un DAG declarativo con capas).
- Usuarios, roles y autenticación (OIDC); aprobaciones por rol y doble aprobación para operaciones críticas.
- Más proveedores (Claude Agent SDK, Bedrock/Vertex) sobre `IModelProvider`.
- Transporte MCP Streamable HTTP para servidores remotos (`ConnectionKind.MCP_HTTP` ya existe en el modelo).
- Notificaciones (Teams/Slack) de aprobaciones pendientes.
- Métricas de calidad y costo por ejecución/agente; evaluación de prompts.
- Build de producción de API/worker (bundle) y despliegue (contenedores) sin cambiar el dominio.

## Hecho en el MVP

Ver tabla de estado en [README.md](README.md) y la bitácora en [PROGRESS.md](PROGRESS.md).
