# Multi-Agent Orchestration Studio - instala el servidor MCP de Jira (sooperset/mcp-atlassian, MIT)
# Uso: powershell -ExecutionPolicy Bypass -File scripts\setup-mcp.ps1 [-Ref ec54351] [-Dir MCP\mcp-atlassian] [-Force] [-EnvFile ruta]
#   -EnvFile  crea (si no existe) el archivo de credenciales de OTRA conexion Jira (otro sitio o cuenta), dentro de MCP\,
#             por ejemplo MCP\mcp-atlassian\cliente-x.env. Es el mismo servidor: no se reinstala si ya esta.
# No se versiona el servidor en este repo: se instala desde el repositorio original, fijado en el commit verificado
# con la plataforma (63 herramientas). Las credenciales de Jira quedan solo en MCP\mcp-atlassian\.env (ignorado por git).
# Requisitos: git y uv (recomendado: instala Python solo; winget install astral-sh.uv) o Python 3.10+ real.
param(
  [string]$Ref = 'ec54351',
  [string]$Dir = 'MCP\mcp-atlassian',
  [string]$EnvFile = '',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$target = if ([System.IO.Path]::IsPathRooted($Dir)) { $Dir } else { Join-Path $root $Dir }
$venv = Join-Path $target '.venv'
$exe = Join-Path $venv 'Scripts\mcp-atlassian.exe'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Magenta }

Step 'Verificando herramientas'
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw 'Se requiere git para instalar el servidor desde GitHub.' }
$uv = Get-Command uv -ErrorAction SilentlyContinue
$py = $null
if (-not $uv) {
  # Python real (se ignora el acceso directo de Microsoft Store en WindowsApps).
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  foreach ($cand in @(@{ exe = 'py'; args = @('-3') }, @{ exe = 'python'; args = @() })) {
    $cmd = Get-Command $cand.exe -ErrorAction SilentlyContinue
    if (-not $cmd -or $cmd.Source -like '*\WindowsApps\*') { continue }
    $ver = & $cand.exe @($cand.args + @('-c', "import sys; print('%d.%d' % sys.version_info[:2])")) 2>$null
    if ($LASTEXITCODE -eq 0 -and $ver -and ([version]$ver -ge [version]'3.10')) { $py = $cand; break }
  }
  $ErrorActionPreference = $prev
  if (-not $py) { throw 'Se requiere uv (recomendado: winget install astral-sh.uv) o Python 3.10+ (https://www.python.org/downloads/).' }
  Write-Host "Python $ver"
} else {
  Write-Host "uv $((& uv --version) -replace '^uv ', '')"
}

if ((Test-Path $exe) -and -not $Force) {
  Write-Host "El servidor ya esta instalado en $target (usa -Force para reinstalar)."
} else {
  Step "Instalando mcp-atlassian@$Ref en $venv"
  New-Item -ItemType Directory -Force $target | Out-Null
  $spec = "mcp-atlassian @ git+https://github.com/sooperset/mcp-atlassian@$Ref"
  if ($uv) {
    & uv venv $venv --python 3.12 --quiet
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual con uv' }
    & uv pip install --python (Join-Path $venv 'Scripts\python.exe') --quiet $spec
  } else {
    & $py.exe @($py.args + @('-m', 'venv', $venv))
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el entorno virtual de Python' }
    & (Join-Path $venv 'Scripts\python.exe') -m pip install --quiet --upgrade pip
    & (Join-Path $venv 'Scripts\python.exe') -m pip install --quiet $spec
  }
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $exe)) { throw 'La instalacion de mcp-atlassian fallo' }
}

Step 'Credenciales de Jira'
if ($EnvFile) {
  $rel = $EnvFile -replace '/', '\'
  if (-not $rel.StartsWith('MCP\') -or -not $rel.EndsWith('.env') -or $rel.Contains('..')) { throw 'El archivo de credenciales debe estar dentro de MCP\ y terminar en .env' }
  $envFile = Join-Path $root $rel
  New-Item -ItemType Directory -Force (Split-Path -Parent $envFile) | Out-Null
} else {
  $envFile = Join-Path $target '.env'
}
if (Test-Path $envFile) {
  Write-Host "Se conserva $envFile (no se muestra su contenido)."
} else {
  Copy-Item (Join-Path $root 'scripts\mcp-atlassian.env.example') $envFile
  Write-Host "Creado $envFile desde la plantilla." -ForegroundColor Yellow
  Write-Host 'Completa JIRA_URL, JIRA_USERNAME y JIRA_API_TOKEN (token: https://id.atlassian.com/manage-profile/security/api-tokens).'
}

Step 'Verificacion'
& $exe --help | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'El ejecutable del servidor MCP no responde' }
Write-Host "Servidor MCP listo: $exe" -ForegroundColor Green
Write-Host 'Siguiente paso: completar el .env, iniciar la plataforma y ejecutar: pnpm mao doctor --mcp'
