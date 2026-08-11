$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $serverRoot

$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
$cloudflaredPath = if ($cloudflaredCommand) { $cloudflaredCommand.Source } else { $null }
if (-not $cloudflaredPath) {
    $portableCloudflared = Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe'
    if (Test-Path -LiteralPath $portableCloudflared) {
        $cloudflaredPath = $portableCloudflared
    }
}
if (-not $cloudflaredPath) {
    throw 'cloudflared non trovato nel PATH.'
}

$userProfilePath = [Environment]::GetFolderPath('UserProfile')
$configPath = Join-Path $userProfilePath '.cloudflared\config.yml'
$tokenPath = Join-Path $userProfilePath '.cloudflared\flbp-local.token'
if (-not (Test-Path -LiteralPath $tokenPath) -and -not (Test-Path -LiteralPath $configPath)) {
    throw "Credenziali Named Tunnel assenti: creare $tokenPath oppure $configPath"
}

$logsDir = Join-Path $serverRoot 'logs'
if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$logPath = Join-Path $logsDir 'tunnel.log'
if (Test-Path -LiteralPath $tokenPath) {
    & $cloudflaredPath tunnel --no-autoupdate run --token-file $tokenPath *>> $logPath
} else {
    & $cloudflaredPath --config $configPath tunnel run *>> $logPath
}
$tunnelExitCode = $LASTEXITCODE
if ($tunnelExitCode -ne 0) { exit $tunnelExitCode }
