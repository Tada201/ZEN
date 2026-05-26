param(
    [switch]$StrictWorkspace
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

$forbiddenFileName = '(?i)(^|[\\/])(\.env(\..*)?|.*\.(db|sqlite|sqlite3|sqlite-journal|db-journal)|.*(api[_-]?key|secret|credential|password|auth[_-]?token).*)$'
$allowedTrackedPath = '(?i)(src-tauri[\\/]src[\\/].*|src[\\/].*|scripts[\\/].*|docs[\\/].*|RULES\.md|AGENTS\.md|AUDIT_REPORT\.md|CODEBASE_DEEP_SCAN_REPORT\.md|package-lock\.json|src-tauri[\\/]Cargo\.lock)$'

function Fail-WithList {
    param(
        [string]$Message,
        [string[]]$Items
    )

    if ($Items.Count -gt 0) {
        Write-Error ($Message + "`n" + ($Items | Sort-Object -Unique | ForEach-Object { " - $_" } | Out-String))
    }
}

$tracked = (& git ls-files) | Where-Object { $_ -match $forbiddenFileName -and $_ -notmatch $allowedTrackedPath }
Fail-WithList "Forbidden secret/database-looking files are tracked by Git." $tracked

$sensitiveRoots = @(
    "src-tauri/resources",
    "src-tauri/gen",
    "src-tauri/target/release/bundle",
    "src-tauri/target/release/resources",
    "dist"
)

$sensitiveHits = @()
foreach ($relativeRoot in $sensitiveRoots) {
    $root = Join-Path $repoRoot $relativeRoot
    if (-not (Test-Path $root)) {
        continue
    }

    $sensitiveHits += Get-ChildItem -LiteralPath $root -Recurse -File -Force |
        Where-Object { $_.FullName -match $forbiddenFileName } |
        ForEach-Object { Resolve-Path -Relative $_.FullName }
}
Fail-WithList "Forbidden secret/database-looking files exist in package-sensitive paths." $sensitiveHits

if ($StrictWorkspace) {
    $excludedDirs = @(
        ".git",
        "node_modules",
        "src-tauri/target",
        "src-tauri/policy-tests/target",
        "dist",
        ".codegraph",
        "graphify-out",
        "EXAMPLE_NO_EDITS"
    )

    $workspaceHits = Get-ChildItem -LiteralPath $repoRoot -Recurse -File -Force |
        Where-Object {
            $relative = Resolve-Path -Relative $_.FullName
            $normalized = $relative.TrimStart(".\").Replace("\", "/")
            ($_.FullName -match $forbiddenFileName) -and
            -not ($excludedDirs | Where-Object { $normalized.StartsWith($_ + "/") -or $normalized -eq $_ })
        } |
        ForEach-Object { Resolve-Path -Relative $_.FullName }

    Fail-WithList "Forbidden secret/database-looking files exist in the workspace." $workspaceHits
}

Write-Host "Secret artifact check passed."
