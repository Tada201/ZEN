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

Assert-NoMatches `
    "Direct Tool.execute(app, ...) calls found outside ToolService" `
    "rg '\.execute\(\s*app' src-tauri/src -n -g '!src-tauri/src/services/tool.rs' -g '!src-tauri/src/tools/mod.rs'"

Assert-NoMatches `
    "Direct AgentTool.run(...) calls found outside ToolService" `
    "rg 'tool\.run\(' src-tauri/src -n -g '!src-tauri/src/services/tool.rs'"

Assert-NoMatches `
    "Backend command reads secret-like keys through SettingsService" `
    "rg 'settings_manager\.get\([^`n]*(api_key|token|secret|credential|password)' src-tauri/src/commands src-tauri/src/agent src-tauri/src/tools src-tauri/src/search -n"

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

$toolsMod = Get-Content "src-tauri/src/tools/mod.rs" -Raw
$defaultRiskStart = $toolsMod.IndexOf("pub fn default_tool_risk")
if ($defaultRiskStart -lt 0) {
    Fail "default_tool_risk not found"
}
$defaultRiskEnd = $toolsMod.IndexOf("pub fn init_tool_registry", $defaultRiskStart)
if ($defaultRiskEnd -lt 0) {
    Fail "init_tool_registry not found after default_tool_risk"
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
