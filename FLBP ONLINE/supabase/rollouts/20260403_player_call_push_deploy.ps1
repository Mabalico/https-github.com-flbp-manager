param(
    [string]$ProjectRef = "kgwhcemqkgqvtsctnwql",
    [string]$SupabaseUrl = "",
    [string]$SupabaseAnonKey = "",
    [string]$SupabaseServiceRoleKey = "",
    [string]$FcmProjectId = "",
    [string]$FcmClientEmail = "",
    [string]$FcmPrivateKeyPath = "",
    [string]$ApnsTeamId = "",
    [string]$ApnsKeyId = "",
    [string]$ApnsPrivateKeyPath = "",
    [string]$ApnsBundleId = "com.flbp.manager.suite",
    [switch]$ApnsSandbox
)

$ErrorActionPreference = "Stop"

function Read-DotEnvValue {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path $Path)) {
        return ""
    }

    $line = Get-Content $Path | Where-Object { $_ -match "^$([regex]::Escape($Name))=" } | Select-Object -First 1
    if (-not $line) {
        return ""
    }

    return ($line -replace "^$([regex]::Escape($Name))=", "").Trim()
}

function Require-Value {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Missing required value: $Name"
    }
}

function Read-SecretFileAsSingleLine {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return ""
    }
    if (-not (Test-Path $Path)) {
        throw "Secret file not found: $Path"
    }

    $raw = Get-Content -Raw $Path
    return ($raw -replace "`r`n", "\n" -replace "`n", "\n").Trim()
}

$onlineRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envLocalPath = Join-Path $onlineRoot ".env.local"

if (-not $SupabaseUrl) {
    $SupabaseUrl = Read-DotEnvValue -Path $envLocalPath -Name "VITE_SUPABASE_URL"
}
if (-not $SupabaseAnonKey) {
    $SupabaseAnonKey = Read-DotEnvValue -Path $envLocalPath -Name "VITE_SUPABASE_ANON_KEY"
}

$fcmPrivateKey = Read-SecretFileAsSingleLine -Path $FcmPrivateKeyPath
$apnsPrivateKey = Read-SecretFileAsSingleLine -Path $ApnsPrivateKeyPath

Require-Value -Name "SUPABASE_ACCESS_TOKEN environment variable" -Value $env:SUPABASE_ACCESS_TOKEN
Require-Value -Name "SUPABASE_URL" -Value $SupabaseUrl
Require-Value -Name "SUPABASE_ANON_KEY" -Value $SupabaseAnonKey
Require-Value -Name "SUPABASE_SERVICE_ROLE_KEY" -Value $SupabaseServiceRoleKey
Require-Value -Name "FCM_PROJECT_ID" -Value $FcmProjectId
Require-Value -Name "FCM_CLIENT_EMAIL" -Value $FcmClientEmail
Require-Value -Name "FCM_PRIVATE_KEY file" -Value $fcmPrivateKey
Require-Value -Name "APNS_TEAM_ID" -Value $ApnsTeamId
Require-Value -Name "APNS_KEY_ID" -Value $ApnsKeyId
Require-Value -Name "APNS_PRIVATE_KEY file" -Value $apnsPrivateKey
Require-Value -Name "APNS_BUNDLE_ID" -Value $ApnsBundleId

$tempEnv = Join-Path $env:TEMP "flbp-player-call-push-secrets.env"
@(
    "SUPABASE_URL=$SupabaseUrl"
    "SUPABASE_ANON_KEY=$SupabaseAnonKey"
    "SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKey"
    "FCM_PROJECT_ID=$FcmProjectId"
    "FCM_CLIENT_EMAIL=$FcmClientEmail"
    "FCM_PRIVATE_KEY=$fcmPrivateKey"
    "APNS_TEAM_ID=$ApnsTeamId"
    "APNS_KEY_ID=$ApnsKeyId"
    "APNS_PRIVATE_KEY=$apnsPrivateKey"
    "APNS_BUNDLE_ID=$ApnsBundleId"
    "APNS_USE_SANDBOX=$($ApnsSandbox.IsPresent.ToString().ToLowerInvariant())"
) | Set-Content -Path $tempEnv -Encoding UTF8

Write-Host "Deploying player-call-push to project $ProjectRef..."
npx supabase functions deploy player-call-push --project-ref $ProjectRef --use-api --workdir $onlineRoot

Write-Host "Setting Edge Function secrets for player-call-push..."
npx supabase secrets set --env-file $tempEnv --project-ref $ProjectRef --workdir $onlineRoot

Write-Host ""
Write-Host "Done."
Write-Host "- Function deployed: player-call-push"
Write-Host "- Secrets applied from: $tempEnv"
Write-Host "- Android package / iOS bundle expected by this rollout: com.flbp.manager.suite"
