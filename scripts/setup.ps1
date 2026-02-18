# Rzeclaw 一条龙安装与配置（Windows PowerShell）
# 用法：在项目根目录执行 .\scripts\setup.ps1 或 powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
# 流程：环境检查 → 安装依赖 → 构建 → 创建示例配置 → 配置向导（模型/终端/Gateway）

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

# 环境与依赖提示
$nodeVer = node -e "console.log(process.version)" 2>$null
if (-not $nodeVer) {
    Write-Host "未检测到 Node.js。请先安装 Node.js >= 18：https://nodejs.org/" -ForegroundColor Red
    exit 1
}
$major = [int]($nodeVer -replace '^v(\d+)\..*','$1')
if ($major -lt 18) {
    Write-Host "当前 Node 版本 $nodeVer 过低，需要 >= 18。请升级后重试。" -ForegroundColor Red
    exit 1
}
Write-Host "[0/5] 环境检查: Node $nodeVer ✓" -ForegroundColor Cyan

Write-Host "[1/5] 安装依赖 (npm install)..." -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/5] 构建 (npm run build)..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$envPath = Join-Path $root ".env"
$envExample = Join-Path $root ".env.example"
if (-not (Test-Path $envPath) -and (Test-Path $envExample)) {
    Copy-Item $envExample $envPath
    Write-Host "[3/5] 已创建 .env，向导中将提示填写 API Key" -ForegroundColor Yellow
} else {
    Write-Host "[3/5] .env 已存在或无示例，跳过" -ForegroundColor Gray
}

$configPath = Join-Path $root "rzeclaw.json"
$configExample = Join-Path $root "rzeclaw.example.json"
if (-not (Test-Path $configPath) -and (Test-Path $configExample)) {
    Copy-Item $configExample $configPath
    Write-Host "[4/5] 已创建 rzeclaw.json，向导中将确认模型与工作区等" -ForegroundColor Yellow
} else {
    Write-Host "[4/5] rzeclaw.json 已存在或无示例，跳过" -ForegroundColor Gray
}

Write-Host "[5/5] 启动配置向导（模型选择、命令终端策略、是否启动 Gateway）..." -ForegroundColor Cyan
Write-Host ""
node rzeclaw.mjs setup
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "配置向导未完成时，可稍后手动执行: node rzeclaw.mjs setup" -ForegroundColor Yellow
    Write-Host "启动方式: node rzeclaw.mjs agent ""你的问题""  或  node rzeclaw.mjs gateway" -ForegroundColor White
}
