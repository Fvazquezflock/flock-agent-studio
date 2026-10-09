# Multi-Agent Orchestration Studio - detiene los servicios iniciados con start.ps1
# Uso: powershell -ExecutionPolicy Bypass -File scripts\stop.ps1 [-Db]
#   -Db  tambien detiene PostgreSQL embebido (los datos se conservan en .data\postgres).
param([switch]$Db)

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$pidFile = Join-Path $root '.data\pids.json'
if (Test-Path $pidFile) {
  $pids = Get-Content $pidFile -Raw | ConvertFrom-Json
  foreach ($prop in $pids.PSObject.Properties) {
    # /T detiene tambien los procesos hijos (node lanzado desde la ventana).
    taskkill /PID $prop.Value /T /F 2>$null | Out-Null
    Write-Host "Detenido $($prop.Name) (PID $($prop.Value))"
  }
  Remove-Item $pidFile -Force
} else {
  Write-Host 'No hay servicios registrados en .data\pids.json'
}
if ($Db) { node scripts/db-embedded.mjs stop }
