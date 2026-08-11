$ErrorActionPreference = 'Stop'

$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $serverRoot '.env'
$examplePath = Join-Path $serverRoot '.env.example'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js non trovato. Installare Node.js 24 o successivo.'
}

$nodeMajor = [int]((node --version).TrimStart('v').Split('.')[0])
if ($nodeMajor -lt 24) {
    throw "Node.js 24 o successivo richiesto. Versione trovata: $(node --version)"
}

if (Test-Path -LiteralPath $envPath) {
    $overwrite = Read-Host '.env esiste già. Ricrearlo? (scrivere SI per confermare)'
    if ($overwrite -ne 'SI') {
        Write-Host 'Configurazione invariata.'
        exit 0
    }
}

if (-not (Test-Path -LiteralPath $examplePath)) {
    throw '.env.example non trovato.'
}

$randomBytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
$adminToken = [Convert]::ToBase64String($randomBytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')

$supabaseUrl = (Read-Host 'SUPABASE_URL (es. https://xxxx.supabase.co)').Trim()
$secureServerKey = Read-Host 'SUPABASE_SECRET_KEY (consigliata; accetta anche la legacy service_role)' -AsSecureString
$serverKeyPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureServerKey)
try {
    $serverKey = ([Runtime.InteropServices.Marshal]::PtrToStringBSTR($serverKeyPtr)).Trim()
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($serverKeyPtr)
}
$publicUrl = (Read-Host 'URL HTTPS del tunnel locale (opzionale; Invio per usare il mirror Supabase pubblico)').Trim().TrimEnd('/')
$cloudflareOrigin = (Read-Host 'Origine della web app pubblica (opzionale, es. https://app.pages.dev)').Trim().TrimEnd('/')
$secondaryBackupDir = (Read-Host 'Cartella replica su secondo disco/USB (consigliata, lasciare vuoto se non disponibile)').Trim()

$allowed = @('http://localhost:8787', 'http://127.0.0.1:8787')
if ($cloudflareOrigin) { $allowed += $cloudflareOrigin }

$lines = @(
    'FLBP_HOST=0.0.0.0',
    'FLBP_PORT=8787',
    'FLBP_WORKSPACE_ID=default',
    'FLBP_DATA_DIR=./data',
    'FLBP_WEB_DIST=../FLBP ONLINE/dist',
    "FLBP_SECONDARY_BACKUP_DIR=`"$secondaryBackupDir`"",
    'FLBP_SECONDARY_BACKUP_RETENTION=24',
    'FLBP_SECONDARY_BACKUP_INTERVAL_MS=300000',
    "FLBP_LOCAL_ADMIN_TOKEN=$adminToken",
    "FLBP_ALLOWED_ORIGINS=$($allowed -join ',')",
    "FLBP_LOCAL_PUBLIC_URL=$publicUrl",
    "SUPABASE_URL=$supabaseUrl",
    "SUPABASE_SECRET_KEY=$serverKey",
    'FLBP_OUTBOX_FLUSH_INTERVAL_MS=15000',
    'FLBP_OUTBOX_BATCH_MAX_OPERATIONS=25',
    'FLBP_OUTBOX_BATCH_MAX_BYTES=524288',
    'FLBP_PUBLIC_LIVE_INTERVAL_MS=60000',
    'FLBP_FULL_BACKUP_INTERVAL_MS=1800000',
    'FLBP_HEARTBEAT_INTERVAL_MS=15000',
    'FLBP_LEASE_TTL_SECONDS=60'
)

[System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
Write-Host ''
Write-Host 'Configurazione creata. Il token Admin non viene mostrato né copiato nel frontend.' -ForegroundColor Green
Write-Host 'Avvia ora "Avvia FLBP Server.cmd".'
