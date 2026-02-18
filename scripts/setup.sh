#!/usr/bin/env bash
# Rzeclaw 一条龙安装与配置（macOS / Linux）
# 用法：在项目根目录执行 ./scripts/setup.sh 或 bash scripts/setup.sh
# 流程：环境检查 → 安装依赖 → 构建 → 创建示例配置 → 配置向导（模型/终端/Gateway）

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 环境与依赖提示
if ! command -v node &>/dev/null; then
  echo "未检测到 Node.js。请先安装 Node.js >= 18：https://nodejs.org/"
  exit 1
fi
NODE_VER=$(node -e 'console.log(process.version)')
NODE_MAJOR=$(node -e 'console.log(parseInt(process.version.slice(1).split(".")[0], 10))')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "当前 Node 版本 $NODE_VER 过低，需要 >= 18。请升级后重试。"
  exit 1
fi
echo "[0/5] 环境检查: Node $NODE_VER ✓"

echo "[1/5] 安装依赖 (npm install)..."
npm install

echo "[2/5] 构建 (npm run build)..."
npm run build

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "[3/5] 已创建 .env，向导中将提示填写 API Key"
else
  echo "[3/5] .env 已存在或无示例，跳过"
fi

if [ ! -f rzeclaw.json ] && [ -f rzeclaw.example.json ]; then
  cp rzeclaw.example.json rzeclaw.json
  echo "[4/5] 已创建 rzeclaw.json，向导中将确认模型与工作区等"
else
  echo "[4/5] rzeclaw.json 已存在或无示例，跳过"
fi

echo "[5/5] 启动配置向导（模型选择、命令终端策略、是否启动 Gateway）..."
echo ""
node rzeclaw.mjs setup
if [ $? -ne 0 ]; then
  echo ""
  echo "配置向导未完成时，可稍后手动执行: node rzeclaw.mjs setup"
  echo "启动方式: node rzeclaw.mjs agent \"你的问题\"  或  node rzeclaw.mjs gateway"
fi
