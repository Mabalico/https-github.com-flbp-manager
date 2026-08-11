$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$workspaceRoot = Split-Path -Parent $serverRoot
$onlineRoot = Join-Path $workspaceRoot 'FLBP ONLINE'
$distIndex = Join-Path $onlineRoot 'dist\index.html'
$windowsAppBuilder = Join-Path $serverRoot 'windows-app\Build-WindowsApp.ps1'

$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}
$nodeMajor = [int]((& $nodeCommand.Source --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
    throw "Node.js 24 o successivo richiesto. Versione trovata: $(& $nodeCommand.Source --version)"
}

if (-not (Test-Path -LiteralPath (Join-Path $onlineRoot 'node_modules\vite'))) {
    throw 'Dipendenze FLBP ONLINE assenti. Eseguire npm install dentro FLBP ONLINE.'
}

Write-Host 'Genero la build web usata dal server locale…' -ForegroundColor Cyan
& npm run build --prefix $onlineRoot
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $distIndex)) {
    throw 'Build FLBP ONLINE non riuscita.'
}

if (-not (Test-Path -LiteralPath (Join-Path $serverRoot '.env'))) {
    & (Join-Path $serverRoot 'Configura FLBP Server.ps1')
}
if (-not (Test-Path -LiteralPath (Join-Path $serverRoot '.env'))) {
    throw 'Configurazione annullata: .env non creato.'
}

if (-not (Test-Path -LiteralPath $windowsAppBuilder)) {
    throw 'Programma di compilazione dell app Windows non trovato.'
}
& $windowsAppBuilder -InstallShortcut
if ($LASTEXITCODE -ne 0) {
    throw 'Compilazione dell app Windows non riuscita.'
}

Write-Host ''
Write-Host 'Installazione locale completata.' -ForegroundColor Green
Write-Host 'Collegamento creato sul Desktop: FLBP Manager Locale.'
Write-Host 'Per il riavvio automatico opzionale usare "Installa avvio automatico.cmd".'
