# Rzeclaw 一条龙安装与配置（Windows PowerShell）
# 用法：在项目根目录执行 .\scripts\setup.ps1 或 powershell -ExecutionPolicy Bypass -File scripts\setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

Write-Host "[1/4] Installing dependencies..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/4] Building..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$envPath = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envPath
    Write-Host "[3/4] Created .env from .env.example — please edit .env and set ANTHROPIC_API_KEY" -ForegroundColor Yellow
} else {
    Write-Host "[3/4] .env already exists or no .env.example; skip" -ForegroundColor Gray
}

$configPath = Join-Path $root "rzeclaw.json"
$configExample = Join-Path $root "rzeclaw.example.json"
if (-not (Test-Path $configPath) -and (Test-Path $configExample)) {
    Copy-Item $configExample $configPath
    Write-Host "[4/4] Created rzeclaw.json from rzeclaw.example.json — adjust workspace if needed" -ForegroundColor Yellow
} else {
    Write-Host "[4/4] rzeclaw.json already exists or no example; skip" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Setup done. Next steps:" -ForegroundColor Green
Write-Host "  1. Set ANTHROPIC_API_KEY in .env (or export the env var)" -ForegroundColor White
Write-Host "  2. Run: node rzeclaw.mjs agent \"your question\"" -ForegroundColor White
Write-Host "  Or:   node rzeclaw.mjs gateway   (then connect a WebSocket client to chat)" -ForegroundColor White
