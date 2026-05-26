param(
    [string]$Platform = "windows-x64"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $PSScriptRoot "runtime-binaries.json"
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$platformConfig = $manifest.platforms.$Platform

if ($null -eq $platformConfig) {
    throw "No runtime binary manifest entry for platform '$Platform'."
}

$missing = @()

foreach ($archive in $platformConfig.archives) {
    foreach ($file in $archive.files) {
        $path = Join-Path $repoRoot ($file.to -replace '/', [IO.Path]::DirectorySeparatorChar)
        if (-not (Test-Path $path)) {
            $missing += $file.to
        }
    }
}

if ($missing.Count -gt 0) {
    Write-Error ("Missing runtime binaries:`n" + ($missing | ForEach-Object { " - $_" } | Out-String))
}

Write-Host "Runtime binary check passed for $Platform."
