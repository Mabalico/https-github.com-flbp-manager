$ErrorActionPreference = 'Stop'

$taskName = 'FLBP Server Locale'
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runnerPath = Join-Path $serverRoot 'Esegui FLBP Server in background.ps1'
$envPath = Join-Path $serverRoot '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Configurazione .env assente. Eseguire prima "Configura FLBP Server.cmd".'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}

$quotedRunner = '"' + $runnerPath.Replace('"', '""') + '"'
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedRunner" `
    -WorkingDirectory $serverRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Server dati locale FLBP con SQLite e sincronizzazione Supabase.' `
    -Force | Out-Null

Write-Host "Avvio automatico installato per l'utente $env:USERNAME." -ForegroundColor Green
Write-Host "Il task '$taskName' partirà al prossimo accesso Windows."

$cloudflaredService = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
$userProfilePath = [Environment]::GetFolderPath('UserProfile')
$cloudflaredConfig = Join-Path $userProfilePath '.cloudflared\config.yml'
$tunnelRunner = Join-Path $serverRoot 'Esegui FLBP Tunnel in background.ps1'

if ($cloudflaredService) {
    Write-Host "Cloudflare Tunnel è già installato come servizio Windows: nessun task duplicato creato." -ForegroundColor Green
} elseif ($cloudflaredCommand -and (Test-Path -LiteralPath $cloudflaredConfig)) {
    $tunnelTaskName = 'FLBP Cloudflare Tunnel'
    $quotedTunnelRunner = '"' + $tunnelRunner.Replace('"', '""') + '"'
    $tunnelAction = New-ScheduledTaskAction `
        -Execute 'powershell.exe' `
        -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedTunnelRunner" `
        -WorkingDirectory $serverRoot
    $tunnelSettings = New-ScheduledTaskSettingsSet `
        -RestartCount 10 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries
    Register-ScheduledTask `
        -TaskName $tunnelTaskName `
        -Action $tunnelAction `
        -Trigger $trigger `
        -Settings $tunnelSettings `
        -Description 'Named Cloudflare Tunnel HTTPS verso FLBP Server Locale.' `
        -Force | Out-Null
    Write-Host "Avvio automatico installato anche per il tunnel Cloudflare." -ForegroundColor Green
} else {
    Write-Warning "Tunnel non ancora registrato: installa cloudflared e crea $cloudflaredConfig, poi riesegui questo script."
}
