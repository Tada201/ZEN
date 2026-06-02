param(
  [switch]$Repair,
  [switch]$Reindex,
  [int]$McpSmokeSeconds = 3
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

function Write-Step($Message) {
  Write-Host "[codegraph] $Message"
}

function Fail($Message) {
  Write-Host "[codegraph] ERROR: $Message" -ForegroundColor Red
  exit 1
}

Write-Step "repo: $repoRoot"

$codegraph = Get-Command codegraph -ErrorAction SilentlyContinue
if (-not $codegraph) {
  Fail "codegraph is not on PATH. Install it, then restart the agent shell."
}
Write-Step "binary: $($codegraph.Source)"

$version = (& codegraph --version) 2>$null
if ($LASTEXITCODE -ne 0) {
  Fail "codegraph --version failed."
}
Write-Step "version: $version"

$mcpPath = Join-Path $repoRoot ".mcp.json"
if (-not (Test-Path $mcpPath)) {
  Fail ".mcp.json is missing."
}

$mcp = Get-Content -Raw -Path $mcpPath | ConvertFrom-Json
$server = $mcp.mcpServers.codegraph
if (-not $server) {
  Fail ".mcp.json does not define mcpServers.codegraph."
}
if ($server.command -ne "codegraph") {
  Fail ".mcp.json codegraph command should be 'codegraph', got '$($server.command)'."
}
$argsText = ($server.args -join " ")
if ($argsText -ne "serve --mcp") {
  Fail ".mcp.json codegraph args should be 'serve --mcp', got '$argsText'."
}
Write-Step ".mcp.json: ok"

$dbPath = Join-Path $repoRoot ".codegraph\codegraph.db"
if (-not (Test-Path $dbPath)) {
  if ($Reindex) {
    Write-Step "index missing; running codegraph init -i"
    & codegraph init -i
    if ($LASTEXITCODE -ne 0) {
      Fail "codegraph init -i failed."
    }
  } else {
    Fail ".codegraph/codegraph.db is missing. Re-run with -Reindex."
  }
}

if ($Reindex) {
  Write-Step "syncing index"
  & codegraph sync
  if ($LASTEXITCODE -ne 0) {
    Fail "codegraph sync failed."
  }
}

Write-Step "index status"
& codegraph status
if ($LASTEXITCODE -ne 0) {
  Fail "codegraph status failed."
}

if ($Repair) {
  Write-Step "installing MCP config for detected agents"
  & codegraph install --target=auto --location=global --yes
  if ($LASTEXITCODE -ne 0) {
    Fail "codegraph install failed."
  }
}

Write-Step "MCP smoke test: starting 'codegraph serve --mcp' for $McpSmokeSeconds second(s)"
$codegraphExe = $codegraph.Source
$startFile = $codegraphExe
$startArgs = @("serve", "--mcp")
if ([System.IO.Path]::GetExtension($codegraphExe) -eq ".ps1") {
  $startFile = "powershell"
  $startArgs = @("-ExecutionPolicy", "Bypass", "-File", $codegraphExe, "serve", "--mcp")
}
$process = Start-Process -FilePath $startFile -ArgumentList $startArgs -NoNewWindow -PassThru -RedirectStandardError "$env:TEMP\codegraph-mcp-stderr.txt" -RedirectStandardOutput "$env:TEMP\codegraph-mcp-stdout.txt"
Start-Sleep -Seconds $McpSmokeSeconds
if ($process.HasExited) {
  $stdout = if (Test-Path "$env:TEMP\codegraph-mcp-stdout.txt") { Get-Content -Raw "$env:TEMP\codegraph-mcp-stdout.txt" } else { "" }
  $stderr = if (Test-Path "$env:TEMP\codegraph-mcp-stderr.txt") { Get-Content -Raw "$env:TEMP\codegraph-mcp-stderr.txt" } else { "" }
  $combined = "$stdout`n$stderr"
  if ($combined -match "Attached to shared daemon") {
    Write-Host $combined
    Write-Step "MCP smoke test: ok (attached to shared daemon)"
    Write-Host ""
    Write-Host "CodeGraph is healthy locally. If an agent still reports 'Transport closed', restart the agent session so it reloads MCP servers." -ForegroundColor Green
    exit 0
  }
  Write-Host $combined
  Fail "MCP server exited during smoke test."
}

Stop-Process -Id $process.Id -Force
Write-Step "MCP smoke test: ok"

Write-Host ""
Write-Host "CodeGraph is healthy locally. If an agent still reports 'Transport closed', restart the agent session so it reloads MCP servers." -ForegroundColor Green
