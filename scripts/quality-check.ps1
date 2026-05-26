param(
    [switch]$SkipCargo,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Fail($Message) {
    Write-Error $Message
    exit 1
}

function Run($Command, $WorkingDirectory = ".") {
    Write-Host "==> $Command"
    Push-Location $WorkingDirectory
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -ne 0) {
            Fail "Command failed: $Command"
        }
    }
    finally {
        Pop-Location
    }
}

function Assert-NoMatches($Description, $Command) {
    Write-Host "==> $Description"
    $matches = Invoke-Expression $Command
    if ($matches) {
        $matches | ForEach-Object { Write-Host $_ }
        Fail $Description
    }
}

if (-not $SkipCargo) {
    Run "cargo check --all-targets" "src-tauri"
}

if (-not $SkipBuild) {
    Run "npm run build"
}

Assert-NoMatches `
    "Raw frontend invoke calls found outside src/api/tauriClient.ts" `
    "rg 'invoke<|invoke\(' src -n -g '!src/api/tauriClient.ts'"

Assert-NoMatches `
    "Inline SQL found outside src-tauri/src/db/queries" `
    "rg 'sqlx::query|query_as::<|query_scalar' src-tauri/src -n -g '!src-tauri/src/db/queries/**' -g '!src-tauri/src/db/mod.rs'"

Assert-NoMatches `
    "Direct registry execution found outside ToolService" `
    "rg 'execute_authorized|execute_with_permission' src-tauri/src -n -g '!src-tauri/src/services/tool.rs' -g '!src-tauri/src/tools/mod.rs'"

$rustLimit = 900
$tsLimit = 500
$violations = @()
$exemptionsPath = "docs/architecture/exemptions.md"
$exemptions = @{}

if (Test-Path $exemptionsPath) {
    Get-Content $exemptionsPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^(src|src-tauri)/.+\.(rs|ts|tsx)$') {
            $exemptions[$line.Replace("/", "\")] = $true
        }
    }
}

function Is-Exempt($Path) {
    $relative = Resolve-Path -Relative $Path
    $relative = $relative.TrimStart(".", "\", "/").Replace("/", "\")
    return $exemptions.ContainsKey($relative)
}

Get-ChildItem src-tauri/src -Recurse -File -Include *.rs | ForEach-Object {
    $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
    if ($lineCount -gt $rustLimit -and -not (Is-Exempt $_.FullName)) {
        $violations += "$($_.FullName): $lineCount lines exceeds Rust hard limit $rustLimit"
    }
}

Get-ChildItem src -Recurse -File -Include *.ts,*.tsx | ForEach-Object {
    $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
    if ($lineCount -gt $tsLimit -and -not (Is-Exempt $_.FullName)) {
        $violations += "$($_.FullName): $lineCount lines exceeds TS/TSX hard limit $tsLimit"
    }
}

if ($violations.Count -gt 0) {
    $violations | ForEach-Object { Write-Host $_ }
    Fail "File size hard-limit violations found"
}

Write-Host "Quality checks passed."
