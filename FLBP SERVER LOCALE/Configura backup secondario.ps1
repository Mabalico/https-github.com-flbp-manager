param(
    [string]$BackupPath = ''
)

$ErrorActionPreference = 'Stop'
$serverRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$envPath = Join-Path $serverRoot '.env'

function Set-FlbpRestrictedAcl([string]$TargetPath, [bool]$IsDirectory) {
    $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $system = [System.Security.Principal.NTAccount]::new('NT AUTHORITY', 'SYSTEM')
    if ($IsDirectory) {
        $acl = [System.Security.AccessControl.DirectorySecurity]::new()
        $inheritance = [System.Security.AccessControl.InheritanceFlags]'ContainerInherit, ObjectInherit'
        $propagation = [System.Security.AccessControl.PropagationFlags]::None
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', $inheritance, $propagation, 'Allow'))
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', $inheritance, $propagation, 'Allow'))
    } else {
        $acl = [System.Security.AccessControl.FileSecurity]::new()
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl', 'Allow'))
        $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, 'FullControl', 'Allow'))
    }
    $acl.SetAccessRuleProtection($true, $false)
    Set-Acl -LiteralPath $TargetPath -AclObject $acl
}

function Get-FlbpEnvValue([string[]]$Lines, [string]$Name) {
    $line = $Lines | Where-Object { $_ -match ('^\s*' + [regex]::Escape($Name) + '\s*=') } | Select-Object -Last 1
    if (-not $line) { return '' }
    return (($line -replace ('^\s*' + [regex]::Escape($Name) + '\s*=\s*'), '').Trim().Trim('"'))
}

function Set-FlbpEnvValue([System.Collections.Generic.List[string]]$Lines, [string]$Name, [string]$Value) {
    $matched = $false
    for ($index = 0; $index -lt $Lines.Count; $index += 1) {
        if ($Lines[$index] -match ('^\s*' + [regex]::Escape($Name) + '\s*=')) {
            $Lines[$index] = "$Name=$Value"
            $matched = $true
        }
    }
    if (-not $matched) { $Lines.Add("$Name=$Value") }
}

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Configurazione .env assente. Eseguire prima "Configura FLBP Server.cmd".'
}

if (-not $BackupPath) {
    $systemDrive = [System.IO.Path]::GetPathRoot($env:SystemRoot).TrimEnd('\')
    $volumes = @(Get-CimInstance Win32_LogicalDisk | Where-Object {
        $_.DeviceID -and $_.DeviceID.TrimEnd('\') -ne $systemDrive -and $_.DriveType -in @(2, 3)
    })
    if ($volumes.Count -eq 0) {
        throw 'Nessun disco USB/SSD non di sistema rilevato.'
    }
    Write-Host 'Dischi disponibili:' -ForegroundColor Cyan
    for ($index = 0; $index -lt $volumes.Count; $index += 1) {
        $volume = $volumes[$index]
        Write-Host "  $($index + 1)) $($volume.DeviceID)  $($volume.VolumeName)"
    }
    $selection = Read-Host 'Numero del disco da usare per FLBP Backup'
    $selectedIndex = 0
    if (-not [int]::TryParse($selection, [ref]$selectedIndex) -or $selectedIndex -lt 1 -or $selectedIndex -gt $volumes.Count) {
        throw 'Selezione non valida.'
    }
    $BackupPath = Join-Path ($volumes[$selectedIndex - 1].DeviceID + '\') 'FLBP Backup'
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.AddRange([string[]](Get-Content -LiteralPath $envPath))
$dataValue = Get-FlbpEnvValue -Lines $lines -Name 'FLBP_DATA_DIR'
if (-not $dataValue) { $dataValue = './data' }
$dataPath = if ([System.IO.Path]::IsPathRooted($dataValue)) { [System.IO.Path]::GetFullPath($dataValue) } else { [System.IO.Path]::GetFullPath((Join-Path $serverRoot $dataValue)) }
$resolvedBackup = [System.IO.Path]::GetFullPath($BackupPath)
if ([System.IO.Path]::GetPathRoot($dataPath) -eq [System.IO.Path]::GetPathRoot($resolvedBackup)) {
    throw 'Il backup secondario deve trovarsi su un volume diverso dal database principale.'
}

New-Item -ItemType Directory -Path $resolvedBackup -Force | Out-Null
Set-FlbpRestrictedAcl -TargetPath $resolvedBackup -IsDirectory $true
Set-FlbpEnvValue -Lines $lines -Name 'FLBP_SECONDARY_BACKUP_DIR' -Value ('"' + $resolvedBackup + '"')
Set-FlbpEnvValue -Lines $lines -Name 'FLBP_REQUIRE_SECONDARY_BACKUP' -Value '1'
[System.IO.File]::WriteAllLines($envPath, $lines, [System.Text.UTF8Encoding]::new($false))
Set-FlbpRestrictedAcl -TargetPath $envPath -IsDirectory $false

Write-Host ''
Write-Host "Backup secondario configurato: $resolvedBackup" -ForegroundColor Green
Write-Host 'Riavvia FLBP Server Locale prima di attivare la modalita locale.' -ForegroundColor Yellow
