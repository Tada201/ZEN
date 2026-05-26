param(
    [string]$Platform = "windows-x64",
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $PSScriptRoot "runtime-binaries.json"
$manifest = Get-Content -Raw $manifestPath | ConvertFrom-Json
$platformConfig = $manifest.platforms.$Platform

if ($null -eq $platformConfig) {
    throw "No runtime binary manifest entry for platform '$Platform'."
}

function Resolve-RepoPath {
    param([string]$Path)
    return Join-Path $repoRoot ($Path -replace '/', [IO.Path]::DirectorySeparatorChar)
}

if ($Clean) {
    foreach ($relativePath in @("src-tauri/resources/binaries/piper", "src-tauri/resources/binaries/whisper", "src-tauri/resources/models")) {
        $path = Resolve-RepoPath $relativePath
        if (Test-Path $path) {
            Remove-Item -LiteralPath $path -Recurse -Force
        }
    }
}

$downloadRoot = Join-Path $env:TEMP "zen-runtime-binaries"
New-Item -ItemType Directory -Force $downloadRoot | Out-Null

foreach ($archive in $platformConfig.archives) {
    $archiveFile = Join-Path $downloadRoot ([IO.Path]::GetFileName(([Uri]$archive.url).AbsolutePath))
    $extractDir = Join-Path $downloadRoot $archive.id

    if (-not (Test-Path $archiveFile)) {
        Write-Host "Downloading $($archive.id) $($archive.version)"
        Invoke-WebRequest -Uri $archive.url -OutFile $archiveFile
    }

    $actualHash = (Get-FileHash -LiteralPath $archiveFile -Algorithm SHA256).Hash.ToUpperInvariant()
    $expectedHash = $archive.sha256.ToUpperInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "SHA256 mismatch for $($archive.id). Expected $expectedHash, got $actualHash."
    }

    if (Test-Path $extractDir) {
        Remove-Item -LiteralPath $extractDir -Recurse -Force
    }
    New-Item -ItemType Directory -Force $extractDir | Out-Null
    if ($archiveFile -match '\.zip$') {
        Expand-Archive -LiteralPath $archiveFile -DestinationPath $extractDir -Force
    } else {
        Copy-Item -LiteralPath $archiveFile -Destination (Join-Path $extractDir ([IO.Path]::GetFileName($archiveFile))) -Force
    }

    foreach ($file in $archive.files) {
        $source = Join-Path $extractDir ($file.from -replace '/', [IO.Path]::DirectorySeparatorChar)
        $destination = Resolve-RepoPath $file.to
        $destinationParent = Split-Path -Parent $destination

        if (-not (Test-Path $source)) {
            throw "Runtime binary source not found: $($file.from) in $($archive.id)"
        }

        New-Item -ItemType Directory -Force $destinationParent | Out-Null
        if ((Get-Item -LiteralPath $source).PSIsContainer) {
            if (Test-Path $destination) {
                Remove-Item -LiteralPath $destination -Recurse -Force
            }
            Copy-Item -LiteralPath $source -Destination $destination -Recurse -Force
        } else {
            Copy-Item -LiteralPath $source -Destination $destination -Force
        }
    }
}

Write-Host "Runtime binaries fetched for $Platform."
