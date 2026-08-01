$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $serverRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}

Write-Host 'RIPRISTINO DATABASE FLBP' -ForegroundColor Yellow
Write-Host 'Il server deve essere completamente arrestato.'
Write-Host 'Il database attuale non verrà cancellato: sarà spostato in una cartella pre-restore.'
Write-Host ''
$backupFile = (Read-Host 'File .sqlite da ripristinare (Invio = copia più recente della replica configurata)').Trim().Trim('"')
$confirmation = Read-Host 'Scrivere esattamente RIPRISTINA per continuare'
if ($confirmation -ne 'RIPRISTINA') {
    Write-Host 'Operazione annullata. Nessun file modificato.'
    exit 0
}

$arguments = @('src/restoreBackupCli.mjs', '--confirm', 'RIPRISTINA')
if ($backupFile) { $arguments += @('--backup', $backupFile) }
& node @arguments
if ($LASTEXITCODE -ne 0) { throw 'Ripristino non completato.' }

Write-Host ''
Write-Host 'Ripristino completato e verificato.' -ForegroundColor Green
Write-Host 'Avviare FLBP Server e premere "Conferma ripresa backup".'
