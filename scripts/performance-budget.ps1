param(
    [string]$DistPath = "dist",
    [int]$MaxJsChunkKb = 5000,
    [int]$MaxCssChunkKb = 700,
    [int]$MaxTotalJsKb = 12000
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $DistPath)) {
    Write-Error "Build output '$DistPath' does not exist. Run npm run build first."
}

$assetsPath = Join-Path $DistPath "assets"
if (-not (Test-Path $assetsPath)) {
    Write-Error "Build assets folder '$assetsPath' does not exist."
}

$jsFiles = Get-ChildItem -Path $assetsPath -Filter "*.js" -File -Recurse
$cssFiles = Get-ChildItem -Path $assetsPath -Filter "*.css" -File -Recurse

$largestJs = $jsFiles | Sort-Object Length -Descending | Select-Object -First 10
$largestCss = $cssFiles | Sort-Object Length -Descending | Select-Object -First 5
$totalJsKb = [math]::Round((($jsFiles | Measure-Object Length -Sum).Sum / 1KB), 1)

Write-Host "==> JavaScript bundle budget"
Write-Host "Total JS: $totalJsKb KB (budget: $MaxTotalJsKb KB)"
$largestJs | ForEach-Object {
    $kb = [math]::Round($_.Length / 1KB, 1)
    Write-Host ("  {0,8} KB  {1}" -f $kb, $_.Name)
}

Write-Host ""
Write-Host "==> CSS bundle budget"
$largestCss | ForEach-Object {
    $kb = [math]::Round($_.Length / 1KB, 1)
    Write-Host ("  {0,8} KB  {1}" -f $kb, $_.Name)
}

$violations = @()

foreach ($file in $jsFiles) {
    $kb = [math]::Round($file.Length / 1KB, 1)
    if ($kb -gt $MaxJsChunkKb) {
        $violations += "JS chunk '$($file.Name)' is $kb KB, over $MaxJsChunkKb KB."
    }
}

foreach ($file in $cssFiles) {
    $kb = [math]::Round($file.Length / 1KB, 1)
    if ($kb -gt $MaxCssChunkKb) {
        $violations += "CSS chunk '$($file.Name)' is $kb KB, over $MaxCssChunkKb KB."
    }
}

if ($totalJsKb -gt $MaxTotalJsKb) {
    $violations += "Total JS is $totalJsKb KB, over $MaxTotalJsKb KB."
}

if ($violations.Count -gt 0) {
    Write-Host ""
    Write-Host "Performance budget violations:" -ForegroundColor Red
    $violations | ForEach-Object { Write-Host "  - $_" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "Performance budget passed."
