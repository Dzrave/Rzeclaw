# RezBot setup (Windows PowerShell)
# Run from project root: .\scripts\setup.ps1
# Flow: env check -> npm install -> build -> create config -> setup wizard

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# Node version check (ASCII only for braces/quotes to avoid parser errors)
$nodeVer = node -e "console.log(process.version)" 2>$null
if (-not $nodeVer) {
    Write-Host "Node.js not found. Install Node >= 18: https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$major = [int]($nodeVer -replace '^v(\d+)\..*', '$1')
if ($major -lt 18) {
    Write-Host "Node $nodeVer is too old; need >= 18." -ForegroundColor Red
    exit 1
}
Write-Host "[0/5] Node $nodeVer OK" -ForegroundColor Cyan

Write-Host "[1/5] npm install..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/5] npm run build..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$envPath = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envPath
    Write-Host "[3/5] Created .env" -ForegroundColor Yellow
} else {
    Write-Host "[3/5] .env exists or no example, skip" -ForegroundColor Gray
}

$configPath = Join-Path $root "rezbot.json"
$configExample = Join-Path $root "rezbot.example.json"
if (-not (Test-Path $configPath) -and (Test-Path $configExample)) {
    Copy-Item $configExample $configPath
    Write-Host "[4/5] Created rezbot.json" -ForegroundColor Yellow
} else {
    Write-Host "[4/5] rezbot.json exists or no example, skip" -ForegroundColor Gray
}

Write-Host "[5/5] Starting config wizard..." -ForegroundColor Cyan
Write-Host ""
node rezbot.mjs setup
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Run later: node rezbot.mjs setup" -ForegroundColor Yellow
    Write-Host "Start: node rezbot.mjs agent ""your message""  or  node rezbot.mjs gateway" -ForegroundColor White
}
