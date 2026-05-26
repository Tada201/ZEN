param(
    [switch]$NoKillStaleBuilds,
    [switch]$IncludeFullAppTests
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
    cargo test --manifest-path policy-tests/Cargo.toml
    if ($LASTEXITCODE -ne 0) {
        Fail "Lightweight backend policy tests failed."
    }

    if ($IncludeFullAppTests) {
        cargo test --all-targets -j 1
        if ($LASTEXITCODE -ne 0) {
            Fail "Full app backend tests failed. On Windows, STATUS_ENTRYPOINT_NOT_FOUND usually means a native DLL loader mismatch before Rust tests run."
        }
    }
    else {
        Write-Host "Skipping full Tauri app tests by default; run scripts/backend-test.ps1 -IncludeFullAppTests to diagnose the known Windows loader issue."
    }
}
finally {
    Pop-Location
}
