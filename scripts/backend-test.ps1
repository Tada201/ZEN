param(
    [switch]$NoKillStaleBuilds
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

if (-not $NoKillStaleBuilds) {
    Get-Process cargo,rustc -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 1
}

Push-Location "src-tauri"
try {
    cargo test --all-targets -j 1
    if ($LASTEXITCODE -ne 0) {
        Fail "Backend test execution failed. On Windows, STATUS_ENTRYPOINT_NOT_FOUND usually means a native DLL loader mismatch before Rust tests run."
    }
}
finally {
    Pop-Location
}
