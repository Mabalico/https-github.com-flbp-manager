$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $serverRoot

$logsDir = Join-Path $serverRoot 'logs'
if (-not (Test-Path -LiteralPath $logsDir)) {
    New-Item -ItemType Directory -Path $logsDir | Out-Null
}

$logPath = Join-Path $logsDir 'server.log'
& node --disable-warning=ExperimentalWarning 'src/server.mjs' *>> $logPath
$nodeExitCode = $LASTEXITCODE
if ($nodeExitCode -ne 0) { exit $nodeExitCode }
