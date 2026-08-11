param(
    [switch]$InstallShortcut
)

$ErrorActionPreference = 'Stop'

$appRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverRoot = Split-Path -Parent $appRoot
$workspaceRoot = Split-Path -Parent $serverRoot
$packageVersion = '1.0.4129.50'
$packageCache = Join-Path $appRoot '.packages'
$packageRoot = Join-Path $packageCache "Microsoft.Web.WebView2.$packageVersion"
$packageFile = Join-Path $packageCache "Microsoft.Web.WebView2.$packageVersion.nupkg"
$coreDll = Join-Path $packageRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'
$winFormsDll = Join-Path $packageRoot 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loaderDll = Join-Path $packageRoot 'runtimes\win-x64\native\WebView2Loader.dll'
$source = Join-Path $appRoot 'src\FLBPManagerLocale.cs'
$manifest = Join-Path $appRoot 'app.manifest'
$config = Join-Path $appRoot 'app.config'
$obj = Join-Path $appRoot 'obj'
$publish = Join-Path $appRoot 'publish'
$outputExe = Join-Path $publish 'FLBP Manager Locale.exe'
$iconSource = Join-Path $workspaceRoot 'FLBP ONLINE\public\icons\icon-192.png'
$iconFile = Join-Path $obj 'flbp-manager-locale.ico'

$cscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
) | Where-Object { Test-Path -LiteralPath $_ }
if ($cscCandidates.Count -eq 0) {
    throw 'Compilatore .NET Framework non trovato su questo PC.'
}
$csc = $cscCandidates[0]

New-Item -ItemType Directory -Path $packageCache, $obj, $publish -Force | Out-Null

if (-not (Test-Path -LiteralPath $coreDll)) {
    if (-not (Test-Path -LiteralPath $packageFile)) {
        Write-Host "Scarico Microsoft WebView2 SDK $packageVersion..." -ForegroundColor Cyan
        $packageUrl = "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$packageVersion/microsoft.web.webview2.$packageVersion.nupkg"
        Invoke-WebRequest -Uri $packageUrl -OutFile $packageFile
    }

    if (-not (Test-Path -LiteralPath $packageRoot)) {
        New-Item -ItemType Directory -Path $packageRoot | Out-Null
    }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($packageFile, $packageRoot)
}

foreach ($required in @($source, $manifest, $config, $coreDll, $winFormsDll, $loaderDll, $iconSource)) {
    if (-not (Test-Path -LiteralPath $required)) {
        throw "File richiesto non trovato: $required"
    }
}

Add-Type -AssemblyName System.Drawing
$bitmap = New-Object System.Drawing.Bitmap($iconSource)
try {
    $handle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    try {
        $stream = [System.IO.File]::Open($iconFile, [System.IO.FileMode]::Create)
        try { $icon.Save($stream) } finally { $stream.Dispose() }
    } finally {
        $icon.Dispose()
    }
} finally {
    $bitmap.Dispose()
}

Write-Host 'Compilo FLBP Manager Locale...' -ForegroundColor Cyan
$compilerArgs = @(
    '/nologo',
    '/target:winexe',
    '/platform:x64',
    '/optimize+',
    "/out:$outputExe",
    "/win32icon:$iconFile",
    "/win32manifest:$manifest",
    '/reference:System.dll',
    '/reference:System.Core.dll',
    '/reference:System.Drawing.dll',
    '/reference:System.Windows.Forms.dll',
    "/reference:$coreDll",
    "/reference:$winFormsDll",
    $source
)
& $csc $compilerArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $outputExe)) {
    throw 'Compilazione dell app Windows non riuscita.'
}

Copy-Item -LiteralPath $coreDll, $winFormsDll, $loaderDll -Destination $publish -Force
Copy-Item -LiteralPath $config -Destination "$outputExe.config" -Force

if ($InstallShortcut) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $shell = New-Object -ComObject WScript.Shell
    foreach ($name in @('FLBP Manager Locale.lnk', 'FLBP Server Locale.lnk')) {
        $shortcutPath = Join-Path $desktop $name
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = $outputExe
        $shortcut.WorkingDirectory = $serverRoot
        $shortcut.IconLocation = "$outputExe,0"
        $shortcut.Description = 'FLBP Manager Locale - gestione torneo su database SQLite'
        $shortcut.Save()
        Write-Host "Collegamento creato: $shortcutPath"
    }
}

Write-Host ''
Write-Host 'FLBP Manager Locale compilato correttamente.' -ForegroundColor Green
Write-Host "Eseguibile: $outputExe"
