#!/usr/bin/env bash
# Rzeclaw 一条龙安装与配置（macOS / Linux）
# 用法：在项目根目录执行 ./scripts/setup.sh 或 bash scripts/setup.sh

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/4] Installing dependencies..."
npm install

echo "[2/4] Building..."
npm run build

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "[3/4] Created .env from .env.example — please edit .env and set ANTHROPIC_API_KEY"
else
  echo "[3/4] .env already exists or no .env.example; skip"
fi

if [ ! -f rzeclaw.json ] && [ -f rzeclaw.example.json ]; then
  cp rzeclaw.example.json rzeclaw.json
  echo "[4/4] Created rzeclaw.json from rzeclaw.example.json — adjust workspace if needed"
else
  echo "[4/4] rzeclaw.json already exists or no example; skip"
fi

echo ""
echo "Setup done. Next steps:"
echo "  1. Set ANTHROPIC_API_KEY in .env (or export the env var)"
echo "  2. Run: node rzeclaw.mjs agent \"your question\""
echo "  Or:   node rzeclaw.mjs gateway   (then connect a WebSocket client to chat)"
