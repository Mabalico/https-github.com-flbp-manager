$ErrorActionPreference = 'Stop'

$taskName = 'FLBP Server Locale'
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $serverRoot '.env'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Configurazione .env assente. Eseguire prima "Configura FLBP Server.cmd".'
}
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}

# Task Scheduler has a reduced startup environment on some Windows systems.
# Pass the absolute Node path to a non-interactive hidden launcher: Node keeps
# its real exit code and persistent logs without opening a console window.
$nodePath = $nodeCommand.Source
$runnerPath = Join-Path $serverRoot 'Esegui FLBP Server in background.ps1'
$taskArguments = "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$runnerPath`" -NodePath `"$nodePath`""
$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument $taskArguments `
    -WorkingDirectory $serverRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
# Il riavvio nativo di Task Scheduler interviene soltanto quando Windows
# classifica l'uscita del processo come errore. Un arresto inatteso con exit
# code 0 lascerebbe quindi il server spento fino al login successivo. Questo
# trigger periodico funge da watchdog: con MultipleInstances=IgnoreNew non
# crea duplicati mentre il server e' attivo, ma lo rilancia entro un minuto
# quando il task torna nello stato Ready.
$watchdogTrigger = New-ScheduledTaskTrigger `
    -Once `
    -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 1) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger @($trigger, $watchdogTrigger) `
    -Settings $settings `
    -Description 'Server dati locale FLBP con SQLite e sincronizzazione Supabase.' `
    -Force | Out-Null

Write-Host "Avvio automatico installato per l'utente $env:USERNAME." -ForegroundColor Green
Write-Host "Il task '$taskName' partirà al prossimo accesso Windows."

$cloudflaredService = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
$cloudflaredCommand = Get-Command cloudflared -ErrorAction SilentlyContinue
$cloudflaredPath = if ($cloudflaredCommand) { $cloudflaredCommand.Source } else { $null }
if (-not $cloudflaredPath) {
    $portableCloudflared = Join-Path $env:LOCALAPPDATA 'Programs\cloudflared\cloudflared.exe'
    if (Test-Path -LiteralPath $portableCloudflared) {
        $cloudflaredPath = $portableCloudflared
    }
}
$userProfilePath = [Environment]::GetFolderPath('UserProfile')
$cloudflaredConfig = Join-Path $userProfilePath '.cloudflared\config.yml'
$cloudflaredToken = Join-Path $userProfilePath '.cloudflared\flbp-local.token'
$tunnelRunner = Join-Path $serverRoot 'Esegui FLBP Tunnel in background.ps1'
$publicUrlLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^\s*FLBP_LOCAL_PUBLIC_URL\s*=' } | Select-Object -Last 1
$publicUrl = if ($publicUrlLine) { (($publicUrlLine -replace '^\s*FLBP_LOCAL_PUBLIC_URL\s*=\s*', '').Trim().Trim('"')) } else { '' }

if (-not $publicUrl) {
    Write-Host 'Tunnel non richiesto: il sito pubblico userà il mirror Supabase; Admin e TV restano sul server locale/LAN.' -ForegroundColor Green
} elseif ($cloudflaredService) {
    Write-Host "Cloudflare Tunnel è già installato come servizio Windows: nessun task duplicato creato." -ForegroundColor Green
} elseif ($cloudflaredPath -and ((Test-Path -LiteralPath $cloudflaredToken) -or (Test-Path -LiteralPath $cloudflaredConfig))) {
    $tunnelTaskName = 'FLBP Cloudflare Tunnel'
    if (Test-Path -LiteralPath $cloudflaredToken) {
        $logsDir = Join-Path $serverRoot 'logs'
        if (-not (Test-Path -LiteralPath $logsDir)) {
            New-Item -ItemType Directory -Path $logsDir | Out-Null
        }
        $tunnelLog = Join-Path $logsDir 'tunnel.log'
        $quotedToken = '"' + $cloudflaredToken.Replace('"', '""') + '"'
        $quotedLog = '"' + $tunnelLog.Replace('"', '""') + '"'
        $tunnelAction = New-ScheduledTaskAction `
            -Execute $cloudflaredPath `
            -Argument "tunnel --no-autoupdate --logfile $quotedLog run --token-file $quotedToken" `
            -WorkingDirectory $serverRoot
    } else {
        $quotedTunnelRunner = '"' + $tunnelRunner.Replace('"', '""') + '"'
        $tunnelAction = New-ScheduledTaskAction `
            -Execute 'powershell.exe' `
            -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File $quotedTunnelRunner" `
            -WorkingDirectory $serverRoot
    }
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
    Write-Warning "FLBP_LOCAL_PUBLIC_URL è configurato ma il tunnel non è registrato: crea $cloudflaredToken oppure $cloudflaredConfig, poi riesegui questo script."
}
