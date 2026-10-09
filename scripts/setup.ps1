# Multi-Agent Orchestration Studio - instalacion local (Windows / PowerShell)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 [-UseDocker]
# Pasos: verifica Node, instala pnpm si falta, crea .env con token, instala dependencias,
# levanta PostgreSQL (embebido o Docker), aplica migraciones y carga datos iniciales.
param([switch]$UseDocker)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Magenta }

Step 'Verificando Node.js'
$nodeVersion = (node --version) 2>$null
if (-not $nodeVersion) { throw 'Node.js no esta instalado. Instala Node 22 o superior.' }
$major = [int]($nodeVersion.TrimStart('v').Split('.')[0])
if ($major -lt 22) { throw "Se requiere Node 22+ (encontrado $nodeVersion)" }
Write-Host "Node $nodeVersion"

Step 'Verificando pnpm'
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  Write-Host 'pnpm no encontrado: se instala para el usuario actual (npm i -g pnpm@10.18.3)'
  npm install -g pnpm@10.18.3
}
Write-Host "pnpm $(pnpm --version)"

Step 'Configuracion (.env)'
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host '.env creado desde .env.example'
}
$envText = Get-Content .env -Raw
if ($envText -match '(?m)^MAO_OWNER_TOKEN=\s*$') {
  $bytes = New-Object byte[] 24
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $token = -join ($bytes | ForEach-Object { $_.ToString('x2') })
  $envText = $envText -replace '(?m)^MAO_OWNER_TOKEN=\s*$', "MAO_OWNER_TOKEN=$token"
  [System.IO.File]::WriteAllText((Join-Path $root '.env'), $envText, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host 'MAO_OWNER_TOKEN generado (no se muestra).'
}

Step 'Instalando dependencias'
pnpm install
if ($LASTEXITCODE -ne 0) { throw 'pnpm install fallo' }

Step 'Base de datos PostgreSQL'
# La base local se levanta siempre: aloja mao_test (pruebas de integracion) y, si DATABASE_URL es loopback,
# tambien la base de trabajo. Con DATABASE_URL remota (Railway) las migraciones y el seed van a la remota.
if ($UseDocker) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker no esta disponible. Ejecuta sin -UseDocker para usar PostgreSQL embebido.' }
  docker compose up -d
  Write-Host 'Esperando a que PostgreSQL acepte conexiones...'
  Start-Sleep -Seconds 5
} else {
  node scripts/db-embedded.mjs start
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo iniciar PostgreSQL embebido' }
}
node scripts/db-embedded.mjs ensure-dbs

Step 'Migraciones y datos iniciales (base de DATABASE_URL)'
pnpm db:migrate
if ($LASTEXITCODE -ne 0) { throw 'Migraciones fallaron' }
pnpm db:seed
if ($LASTEXITCODE -ne 0) { throw 'Carga inicial fallo' }

Step 'Estilos del design system'
node design-system/scripts/build-tokens.mjs

Write-Host "`nInstalacion completa." -ForegroundColor Green
Write-Host 'Siguiente paso: powershell -ExecutionPolicy Bypass -File scripts\start.ps1'
Write-Host 'Diagnostico:    pnpm doctor   (o pnpm mao doctor --mcp para probar MCP en vivo)'
