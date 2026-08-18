$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $serverRoot '.env'

function Get-FlbpEnvValue([string[]]$Lines, [string]$Name) {
    $line = $Lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Name) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return '' }
    return (($line -replace ('^\s*' + [regex]::Escape($Name) + '\s*=\s*'), '').Trim().Trim('"'))
}

function Assert-FlbpRestrictedAcl([string]$TargetPath, [bool]$RequireProtected) {
    if (-not (Test-Path -LiteralPath $TargetPath)) { throw "Percorso protetto assente: $TargetPath" }
    $acl = Get-Acl -LiteralPath $TargetPath
    if ($RequireProtected -and -not $acl.AreAccessRulesProtected) {
        throw "ACL ereditaria non disabilitata: $TargetPath"
    }
    $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $allowedSids = @($currentSid, 'S-1-5-18')
    foreach ($rule in $acl.Access) {
        if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) { continue }
        try {
            $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
        } catch {
            throw "Identita ACL non verificabile su $TargetPath`: $($rule.IdentityReference)"
        }
        if ($allowedSids -notcontains $sid) {
            throw "Permesso ACL inatteso su $TargetPath`: $($rule.IdentityReference)"
        }
    }
    Write-Host "PASS  ACL protetta: $TargetPath" -ForegroundColor Green
}

if (-not (Test-Path -LiteralPath $envPath)) { throw '.env assente.' }
$lines = Get-Content -LiteralPath $envPath
$dataValue = Get-FlbpEnvValue -Lines $lines -Name 'FLBP_DATA_DIR'
if (-not $dataValue) { $dataValue = './data' }
$dataPath = if ([System.IO.Path]::IsPathRooted($dataValue)) { [System.IO.Path]::GetFullPath($dataValue) } else { [System.IO.Path]::GetFullPath((Join-Path $serverRoot $dataValue)) }
$backupPath = Get-FlbpEnvValue -Lines $lines -Name 'FLBP_SECONDARY_BACKUP_DIR'

Assert-FlbpRestrictedAcl -TargetPath $envPath -RequireProtected $true
Assert-FlbpRestrictedAcl -TargetPath $dataPath -RequireProtected $true
Get-ChildItem -LiteralPath $dataPath -Filter '*.sqlite' -File -ErrorAction SilentlyContinue | ForEach-Object {
    Assert-FlbpRestrictedAcl -TargetPath $_.FullName -RequireProtected $false
}
if ($backupPath) {
    Assert-FlbpRestrictedAcl -TargetPath $backupPath -RequireProtected $true
    if ([System.IO.Path]::GetPathRoot($dataPath) -eq [System.IO.Path]::GetPathRoot([System.IO.Path]::GetFullPath($backupPath))) {
        throw 'Database principale e backup secondario risultano sullo stesso volume.'
    }
    Write-Host 'PASS  Backup su volume distinto.' -ForegroundColor Green
}

Set-Location -LiteralPath $serverRoot
& npm run preflight
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
