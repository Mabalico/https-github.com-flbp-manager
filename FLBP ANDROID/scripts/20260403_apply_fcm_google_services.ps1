param(
    [Parameter(Mandatory = $true)]
    [string]$GoogleServicesJsonPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $GoogleServicesJsonPath)) {
    throw "google-services.json not found: $GoogleServicesJsonPath"
}

$androidRoot = Split-Path -Parent $PSScriptRoot
$stringsPath = Join-Path $androidRoot "app\src\main\res\values\strings.xml"

if (-not (Test-Path $stringsPath)) {
    throw "Android strings.xml not found: $stringsPath"
}

$json = Get-Content -Raw $GoogleServicesJsonPath | ConvertFrom-Json

$projectId = [string]$json.project_info.project_id
$senderId = [string]$json.project_info.project_number
$applicationId = [string]$json.client[0].client_info.mobilesdk_app_id
$apiKey = [string]$json.client[0].api_key[0].current_key

if ([string]::IsNullOrWhiteSpace($projectId) -or [string]::IsNullOrWhiteSpace($senderId) -or [string]::IsNullOrWhiteSpace($applicationId) -or [string]::IsNullOrWhiteSpace($apiKey)) {
    throw "google-services.json is missing one or more required FCM fields."
}

[xml]$xml = Get-Content $stringsPath

foreach ($entry in @(
    @{ Name = "fcm_application_id"; Value = $applicationId },
    @{ Name = "fcm_project_id"; Value = $projectId },
    @{ Name = "fcm_api_key"; Value = $apiKey },
    @{ Name = "fcm_sender_id"; Value = $senderId }
)) {
    $node = $xml.resources.string | Where-Object { $_.name -eq $entry.Name } | Select-Object -First 1
    if (-not $node) {
        $node = $xml.CreateElement("string")
        $attr = $xml.CreateAttribute("name")
        $attr.Value = $entry.Name
        [void]$node.Attributes.Append($attr)
        [void]$xml.resources.AppendChild($node)
    }
    $node.InnerText = $entry.Value
}

$xml.Save($stringsPath)

Write-Host "Updated Android FCM values in $stringsPath"
Write-Host "- fcm_application_id = $applicationId"
Write-Host "- fcm_project_id = $projectId"
Write-Host "- fcm_sender_id = $senderId"
