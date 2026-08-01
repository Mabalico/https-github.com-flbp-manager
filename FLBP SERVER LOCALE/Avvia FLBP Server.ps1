$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $serverRoot '.env'
$runnerPath = Join-Path $serverRoot 'Esegui FLBP Server in background.ps1'
$healthUrl = 'http://127.0.0.1:8787/health'
$panelUrl = 'http://127.0.0.1:8787/'

if (-not (Test-Path -LiteralPath $envPath)) {
    & (Join-Path $serverRoot 'Configura FLBP Server.ps1')
    if (-not (Test-Path -LiteralPath $envPath)) { exit 1 }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}

function Test-FlbpServer {
    try {
        $reply = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 1
        return [bool]$reply.ok
    } catch {
        return $false
    }
}

if (-not (Test-FlbpServer)) {
    Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', "`"$runnerPath`"") `
        -WorkingDirectory $serverRoot `
        -WindowStyle Hidden | Out-Null

    $ready = $false
    foreach ($attempt in 1..30) {
        Start-Sleep -Milliseconds 250
        if (Test-FlbpServer) {
            $ready = $true
            break
        }
    }
    if (-not $ready) {
        throw 'Il server non è partito entro il tempo previsto. Controllare logs/server.log.'
    }
}

$edgeCandidates = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
    (Join-Path $env:LocalAppData 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($edgeCandidates.Count -gt 0) {
    Start-Process -FilePath $edgeCandidates[0] -ArgumentList "--app=$panelUrl" | Out-Null
} else {
    Start-Process $panelUrl | Out-Null
}
