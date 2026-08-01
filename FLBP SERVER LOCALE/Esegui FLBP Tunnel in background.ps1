$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $serverRoot

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
if (-not $cloudflaredCommand) {
    throw 'cloudflared non trovato nel PATH.'
}

$userProfilePath = [Environment]::GetFolderPath('UserProfile')
$configPath = Join-Path $userProfilePath '.cloudflared\config.yml'
if (-not (Test-Path -LiteralPath $configPath)) {
    throw "Configurazione Named Tunnel assente: $configPath"
}

$logsDir = Join-Path $serverRoot 'logs'
if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$logPath = Join-Path $logsDir 'tunnel.log'
& $cloudflaredCommand.Source --config $configPath tunnel run *>> $logPath
$tunnelExitCode = $LASTEXITCODE
if ($tunnelExitCode -ne 0) { exit $tunnelExitCode }
