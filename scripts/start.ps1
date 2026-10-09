# Multi-Agent Orchestration Studio - arranque local
# Uso: powershell -ExecutionPolicy Bypass -File scripts\start.ps1 [-Background] [-UseDocker]
#   (sin -Background) abre una ventana por servicio: API, worker y web.
#   -Background      corre los servicios ocultos con logs en .data\logs y PIDs en .data\pids.json.
param([switch]$Background, [switch]$UseDocker)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
if (-not (Test-Path .env)) { throw 'Falta .env: ejecuta primero scripts\setup.ps1' }

Write-Host '==> PostgreSQL' -ForegroundColor Magenta
# Con DATABASE_URL remota (p. ej. Railway) no se inicia la base local: los servicios usan la remota.
if ($UseDocker) { docker compose up -d } else { node scripts/db-embedded.mjs start-if-local }
if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL no inicio' }

$services = @(
  @{ name = 'api';    args = @('--import', 'tsx', 'apps/api/src/server.ts') },
  @{ name = 'worker'; args = @('--import', 'tsx', 'apps/worker/src/index.ts') },
  @{ name = 'web';    args = @('apps/web/scripts/next.mjs', 'dev') }
)

$pids = @{}
New-Item -ItemType Directory -Force (Join-Path $root '.data\logs') | Out-Null
foreach ($s in $services) {
  if ($Background) {
    $log = Join-Path $root ".data\logs\$($s.name).log"
    $err = Join-Path $root ".data\logs\$($s.name).err.log"
    $p = Start-Process -FilePath node -ArgumentList $s.args -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err -PassThru
  } else {
    $cmd = "Set-Location '$root'; `$Host.UI.RawUI.WindowTitle = 'MAO $($s.name)'; node $($s.args -join ' ')"
    $p = Start-Process -FilePath powershell -ArgumentList @('-NoExit', '-Command', $cmd) -PassThru
  }
  $pids[$s.name] = $p.Id
  Write-Host "Iniciado $($s.name) (PID $($p.Id))"
}
$pids | ConvertTo-Json | Set-Content -Path (Join-Path $root '.data\pids.json') -Encoding ASCII

Write-Host '==> Esperando servicios (hasta 180 s)' -ForegroundColor Magenta
$deadline = (Get-Date).AddSeconds(180)
$apiOk = $false; $webOk = $false
while ((Get-Date) -lt $deadline -and -not ($apiOk -and $webOk)) {
  if (-not $apiOk) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:4317/health' -TimeoutSec 3 | Out-Null; $apiOk = $true; Write-Host 'API lista: http://127.0.0.1:4317' } catch {} }
  if (-not $webOk) { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/' -TimeoutSec 10 | Out-Null; $webOk = $true; Write-Host 'Web lista: http://127.0.0.1:3000' } catch {} }
  if (-not ($apiOk -and $webOk)) { Start-Sleep -Seconds 3 }
}
if (-not ($apiOk -and $webOk)) { Write-Warning 'Algun servicio no respondio a tiempo. Revisa las ventanas o .data\logs.' }
Write-Host "`nAbri http://127.0.0.1:3000  |  CLI: pnpm mao help  |  Detener: scripts\stop.ps1" -ForegroundColor Green
