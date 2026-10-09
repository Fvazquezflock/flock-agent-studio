# Multi-Agent Orchestration Studio - diagnostico del entorno
# Uso: powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1 [-Mcp]
#   -Mcp  ademas inicia el servidor MCP de Jira y diagnostica proveedores en vivo (requiere la API iniciada).
# Muestra Disponible / No configurado / Error. Nunca imprime credenciales.
param([switch]$Mcp)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$cliArgs = @('--import', 'tsx', 'apps/cli/src/index.ts', 'doctor')
if ($Mcp) { $cliArgs += '--mcp' }
node @cliArgs
exit $LASTEXITCODE
