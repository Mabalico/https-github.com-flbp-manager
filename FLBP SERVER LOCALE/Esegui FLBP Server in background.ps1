param(
    [string]$NodePath = ''
)

$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $serverRoot

$logsDir = Join-Path $serverRoot 'logs'
if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$logPath = Join-Path $logsDir 'launcher.log'
if (-not $NodePath) {
    $nodeCommand = Get-Command node -ErrorAction Stop
    $NodePath = $nodeCommand.Source
}
if (-not (Test-Path -LiteralPath $NodePath)) {
    throw "Node.js non trovato: $NodePath"
}
# server.mjs writes and rotates logs\server.log itself. This secondary log also
# captures failures that happen before the JavaScript logger can start.
& $NodePath --use-system-ca --disable-warning=ExperimentalWarning 'src/server.mjs' *>> $logPath
$nodeExitCode = $LASTEXITCODE
if ($nodeExitCode -ne 0) { exit $nodeExitCode }
