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

function Assert-NoMatches($Description, [scriptblock]$Check) {
    Write-Host "==> $Description"
    $matches = Invoke-Command -ScriptBlock $Check
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

Run "npm run lint:tokens"

Assert-NoMatches `
    "Raw frontend invoke calls found outside src/api/tauriClient.ts" `
    { Get-ChildItem src -Recurse -File | Where-Object { $_.FullName -notmatch 'src[/\\]api[/\\]tauriClient\.ts' } | Select-String -Pattern 'invoke<|invoke\(' }

# Backend guards scan the app crate and every workspace crate. SQL belongs to
# zen-db (queries/ plus its migration DDL and pool bootstrap); the tool
# contracts themselves live in zen-tools/src/registry.rs, and the only
# execution boundary is the app-side ToolService.
$backendRoots = @("src-tauri/src", "src-tauri/crates") | Where-Object { Test-Path $_ }
$sqlOwner = 'zen-db[/\\]src[/\\](queries|migrations)[/\\]|zen-db[/\\]src[/\\]pool\.rs'
$toolOwner = 'src-tauri[/\\]src[/\\]services[/\\]tool([/\\]|\.rs)|zen-tools[/\\]src[/\\]registry\.rs'

Assert-NoMatches `
    "Inline SQL found outside src-tauri/crates/zen-db/src/queries" `
    { Get-ChildItem $backendRoots -Recurse -File -Filter *.rs | Where-Object { $_.FullName -notmatch $sqlOwner } | Select-String -Pattern 'sqlx::query|query_as::<|query_scalar' }

Assert-NoMatches `
    "Direct registry execution found outside ToolService" `
    { Get-ChildItem $backendRoots -Recurse -File -Filter *.rs | Where-Object { $_.FullName -notmatch $toolOwner } | Select-String -Pattern 'execute_authorized|execute_with_permission' }

Assert-NoMatches `
    "Direct Tool.execute(app, ...) calls found outside ToolService" `
    { Get-ChildItem $backendRoots -Recurse -File -Filter *.rs | Where-Object { $_.FullName -notmatch $toolOwner } | Select-String -Pattern '\.execute\(\s*app' }

Assert-NoMatches `
    "Direct AgentTool.run(...) calls found outside ToolService" `
    { Get-ChildItem $backendRoots -Recurse -File -Filter *.rs | Where-Object { $_.FullName -notmatch $toolOwner } | Select-String -Pattern 'tool\.run\(' }

Assert-NoMatches `
    "Backend command reads secret-like keys through SettingsService" `
    {
        Get-ChildItem $backendRoots -Recurse -File -Filter *.rs -ErrorAction SilentlyContinue | Select-String -Pattern 'settings_manager\.get\([^)]*(api_key|token|secret|credential|password)'
    }

$coveragePath = "src-tauri/tool-coverage.json"
if (-not (Test-Path $coveragePath)) {
    Fail "Privileged tool coverage manifest missing: $coveragePath"
}

$coverage = Get-Content $coveragePath -Raw | ConvertFrom-Json
$coverageById = @{}
foreach ($entry in @($coverage)) {
    foreach ($field in @("id", "risk", "owner", "status", "evidence")) {
        if (-not $entry.$field) {
            Fail "Privileged tool coverage entry is missing '$field'"
        }
    }
    if ($coverageById.ContainsKey($entry.id)) {
        Fail "Duplicate privileged tool coverage entry '$($entry.id)'"
    }
    if ($entry.risk -notin @("Medium", "High", "Critical")) {
        Fail "Privileged tool coverage entry '$($entry.id)' has invalid risk '$($entry.risk)'"
    }
    $coverageById[$entry.id] = $entry
}

$toolsMod = Get-Content "src-tauri/crates/zen-tools/src/registry.rs" -Raw
$defaultRiskStart = $toolsMod.IndexOf("pub fn default_tool_risk")
if ($defaultRiskStart -lt 0) {
    Fail "default_tool_risk not found"
}
$defaultRiskEnd = $toolsMod.IndexOf("LAZY TOOL SOURCE PORT", $defaultRiskStart)
if ($defaultRiskEnd -lt 0) {
    Fail "LAZY TOOL SOURCE PORT marker not found after default_tool_risk"
}
$defaultRiskBody = $toolsMod.Substring($defaultRiskStart, $defaultRiskEnd - $defaultRiskStart)

$riskMatches = [regex]::Matches(
    $defaultRiskBody,
    '(?s)(?<ids>(?:"[^"]+"\s*\|?\s*)+)=>\s*RiskLevel::(?<risk>Medium|High|Critical)'
)
foreach ($match in $riskMatches) {
    $risk = $match.Groups["risk"].Value
    $ids = [regex]::Matches($match.Groups["ids"].Value, '"([^"]+)"') |
        ForEach-Object { $_.Groups[1].Value }
    foreach ($id in $ids) {
        if (-not $coverageById.ContainsKey($id)) {
            Fail "Privileged tool '$id' with risk '$risk' is missing from $coveragePath"
        }
        if ($coverageById[$id].risk -ne $risk) {
            Fail "Privileged tool '$id' has coverage risk '$($coverageById[$id].risk)' but default_tool_risk says '$risk'"
        }
    }
}

$settingsCommands = Get-Content "src-tauri/src/commands/settings.rs" -Raw
$getAllStart = $settingsCommands.IndexOf("pub async fn get_all_settings")
if ($getAllStart -ge 0) {
    $nextCommand = $settingsCommands.IndexOf("#[tauri::command]", $getAllStart + 1)
    if ($nextCommand -lt 0) {
        $nextCommand = $settingsCommands.Length
    }
    $getAllBody = $settingsCommands.Substring($getAllStart, $nextCommand - $getAllStart)
    if ($getAllBody -match "settings_manager\.get_all\(\)") {
        Fail "Public get_all_settings command must use get_all_public, not get_all"
    }
}

$progressiveTools = Get-Content "src-tauri/src/agent/tools/progressive.rs" -Raw
$toolIds = [regex]::Matches($progressiveTools, 'ToolMetadata::new\(\s*"([^"]+)"') |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique
$toolIdSet = @{}
$toolIds | ForEach-Object { $toolIdSet[$_] = $true }

Get-ChildItem "src-tauri/resources/agents" -Filter *.json | ForEach-Object {
    $agent = Get-Content $_.FullName -Raw | ConvertFrom-Json
    foreach ($toolId in @($agent.tool_ids)) {
        if (-not $toolIdSet.ContainsKey($toolId)) {
            Fail "Agent config $($_.Name) references unknown tool_id '$toolId'"
        }
    }
}

$rustLimit = 900
$tsLimit = 500
$violations = @()
$exemptionsPath = "docs/architecture/exemptions.md"
$exemptions = @{}

if (Test-Path $exemptionsPath) {
    Get-Content $exemptionsPath | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^(?:File:\s*)?((src|src-tauri)/.+\.(rs|ts|tsx))$') {
            $exemptions[$matches[1].Replace("/", "\")] = $true
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

# The Cargo-workspace migration moved most backend code into library crates
# under src-tauri/crates; hold them to the same Rust hard limit as the app crate.
if (Test-Path "src-tauri/crates") {
    Get-ChildItem src-tauri/crates -Recurse -File -Include *.rs | ForEach-Object {
        $lineCount = (Get-Content $_.FullName | Measure-Object -Line).Lines
        if ($lineCount -gt $rustLimit -and -not (Is-Exempt $_.FullName)) {
            $violations += "$($_.FullName): $lineCount lines exceeds Rust hard limit $rustLimit"
        }
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

# ── Crate boundary guard (RULES.md §3.1) ─────────────────────────────────────
# Library crates under src-tauri/crates must never depend on `tauri` or
# `keyring`: host coupling and OS-keyring access belong to the app crate only.
# A manifest match here means a dependency edge crossed the boundary.
if (Test-Path "src-tauri/crates") {
    $boundaryViolations = @()
    Get-ChildItem src-tauri/crates -Recurse -File -Filter Cargo.toml | ForEach-Object {
        $manifest = $_.FullName
        Get-Content $manifest | ForEach-Object {
            $line = $_.Trim()
            # Skip comments so an explanatory note mentioning the crate name
            # is not mistaken for a dependency edge.
            if ($line.StartsWith("#")) { return }
            if ($line -match '^(tauri|keyring)\b' -or $line -match '^(tauri|keyring)\s*=') {
                $boundaryViolations += "${manifest}: forbidden crate dependency '$($matches[1])' (crates must stay tauri/keyring-free)"
            }
        }
    }
    if ($boundaryViolations.Count -gt 0) {
        $boundaryViolations | ForEach-Object { Write-Host $_ }
        Fail "Crate boundary violations found"
    }
}

Write-Host "Quality checks passed."
